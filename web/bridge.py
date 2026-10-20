"""
Bridge between the browser UI and the CS188 Pac-Man code.

Runs inside Pyodide (Python compiled to WebAssembly). It imports the project's
own modules unchanged -- search.py, searchAgents.py, pacman.py, game.py --
and exposes three JSON-in / JSON-out entry points to JavaScript:

    board(name)        -> walls, food, capsules and agent starts of a layout
    run_search(cfg)    -> run one search and report expansions, path and cost
    game_new / game_step -> play the real game rules one tick at a time
"""
import inspect
import json
import time

import layout as layoutmod
import pacman
import search
import searchAgents
import ghostAgents
from game import Actions, Directions


class SearchLimit(Exception):
    pass


ALGORITHMS = {
    'dfs': search.depthFirstSearch,
    'bfs': search.breadthFirstSearch,
    'ucs': search.uniformCostSearch,
    'astar': search.aStarSearch,
}

HEURISTICS = {
    'null': search.nullHeuristic,
    'manhattan': searchAgents.manhattanHeuristic,
    'euclidean': searchAgents.euclideanHeuristic,
    'corners': searchAgents.cornersHeuristic,
    'food': searchAgents.foodHeuristic,
}

COST_FUNCTIONS = {
    'uniform': lambda pos: 1,
    'stayEast': lambda pos: .5 ** pos[0],
    'stayWest': lambda pos: 2 ** pos[0],
}

SOURCES = {
    'dfs': search.depthFirstSearch,
    'bfs': search.breadthFirstSearch,
    'ucs': search.uniformCostSearch,
    'astar': search.aStarSearch,
    'corners': searchAgents.CornersProblem,
    'cornersHeuristic': searchAgents.cornersHeuristic,
    'foodHeuristic': searchAgents.foodHeuristic,
}


def _load(name):
    lay = layoutmod.getLayout(name)
    if lay is None:
        raise ValueError('Layout not found: ' + name)
    return lay


def _grid_cells(grid):
    return [[x, y] for x in range(grid.width) for y in range(grid.height) if grid[x][y]]


def _position(state):
    """Pac-Man's (x, y) inside any of the three search-state shapes."""
    if isinstance(state, tuple) and len(state) == 2 and isinstance(state[0], tuple):
        return state[0]
    return state


def board(name):
    lay = _load(name)
    agents = [{'pacman': bool(isPac), 'pos': list(pos)} for isPac, pos in lay.agentPositions]
    return json.dumps({
        'name': name,
        'width': lay.width,
        'height': lay.height,
        'walls': _grid_cells(lay.walls),
        'food': _grid_cells(lay.food),
        'capsules': [list(c) for c in lay.capsules],
        'agents': agents,
    })


def source(key):
    return inspect.getsource(SOURCES[key])


def _make_problem(problem_type, game_state, cost):
    if problem_type == 'position':
        food = game_state.getFood().asList()
        goal = food[0] if len(food) == 1 else (1, 1)
        return searchAgents.PositionSearchProblem(
            game_state, COST_FUNCTIONS[cost], goal, None, warn=False, visualize=False)
    if problem_type == 'corners':
        return searchAgents.CornersProblem(game_state)
    if problem_type == 'food':
        return searchAgents.FoodSearchProblem(game_state)
    raise ValueError('Unknown problem: ' + problem_type)


def run_search(cfg_json):
    cfg = json.loads(cfg_json)
    game_state = pacman.GameState()
    game_state.initialize(_load(cfg['layout']), 0)
    problem = _make_problem(cfg['problem'], game_state, cfg.get('cost', 'uniform'))

    limit = int(cfg.get('limit', 300000))
    order = []
    original = problem.getSuccessors

    def recording_successors(state):
        order.append(list(_position(state)))
        if len(order) > limit:
            raise SearchLimit()
        return original(state)

    problem.getSuccessors = recording_successors

    algo = ALGORITHMS[cfg['algorithm']]
    started = time.perf_counter()
    status = 'found'
    actions = None
    try:
        if cfg['algorithm'] == 'astar':
            actions = algo(problem, HEURISTICS[cfg.get('heuristic', 'null')])
        else:
            actions = algo(problem)
    except SearchLimit:
        status = 'limit'
    elapsed = (time.perf_counter() - started) * 1000

    if status == 'found' and not actions and not problem.isGoalState(problem.getStartState()):
        status = 'none'

    path = []
    cost = None
    if status == 'found':
        actions = list(actions or [])
        x, y = game_state.getPacmanPosition()
        path.append([x, y])
        for action in actions:
            dx, dy = Actions.directionToVector(action)
            x, y = int(x + dx), int(y + dy)
            path.append([x, y])
        cost = problem.getCostOfActions(actions)
    else:
        actions = []

    return json.dumps({
        'status': status,
        'actions': actions,
        'path': path,
        'cost': cost,
        'expanded': min(len(order), limit),
        'order': order[:limit],
        'ms': round(elapsed, 1),
        'limit': limit,
    })


# ---------------------------------------------------------------- play mode

_game = {}


def _snapshot():
    state = _game['state']
    pac = state.getPacmanState().configuration
    ghosts = []
    for g in state.getGhostStates():
        ghosts.append({
            'pos': list(g.configuration.getPosition()),
            'dir': g.configuration.getDirection(),
            'scared': g.scaredTimer,
        })
    return json.dumps({
        'pacman': {'pos': list(pac.getPosition()), 'dir': pac.getDirection()},
        'ghosts': ghosts,
        'food': _grid_cells(state.getFood()),
        'capsules': [list(c) for c in state.getCapsules()],
        'score': state.getScore(),
        'win': state.isWin(),
        'lose': state.isLose(),
    })


def game_new(name, ghost_kind, num_ghosts):
    lay = _load(name)
    state = pacman.GameState()
    state.initialize(lay, int(num_ghosts))
    kind = ghostAgents.DirectionalGhost if ghost_kind == 'directional' else ghostAgents.RandomGhost
    _game['state'] = state
    _game['ghosts'] = [kind(i + 1) for i in range(state.getNumAgents() - 1)]
    return _snapshot()


def game_step(wanted, current):
    state = _game['state']
    if state.isWin() or state.isLose():
        return _snapshot()
    legal = state.getLegalActions(0)
    if wanted in legal:
        action = wanted
    elif current in legal:
        action = current
    else:
        action = Directions.STOP
    state = state.generateSuccessor(0, action)
    for ghost in _game['ghosts']:
        if state.isWin() or state.isLose():
            break
        state = state.generateSuccessor(ghost.index, ghost.getAction(state))
    _game['state'] = state
    return _snapshot()
