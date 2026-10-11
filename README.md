# Pac-Man Search — SE3062 Intelligent Systems

Group assignment implementing the classic uninformed and informed search
algorithms (DFS, BFS, UCS, A\*) and designing admissible, consistent heuristics
for two structured problems (finding all corners, and eating all the food dots),
built on the UC Berkeley CS188 Pac-Man framework.

## Team

| Member  | Questions |
|---------|-----------|
| Chamara | Q1 DFS, Q5 CornersProblem |
| Kavisha | Q2 BFS |
| Sawanya | Q3 UCS, Q7 Food Heuristic |
| Rosheni | Q4 A\*, Q6 Corners Heuristic |

## What we implemented

All work lives in **two files** (per the assignment — no other file is edited):

| File | Questions | What we added |
|------|-----------|---------------|
| `search.py` | Q1–Q4 | `depthFirstSearch`, `breadthFirstSearch`, `uniformCostSearch`, `aStarSearch` |
| `searchAgents.py` | Q5–Q7 | `CornersProblem`, `cornersHeuristic`, `foodHeuristic` |

Every algorithm follows the same graph-search skeleton; only the fringe changes:

- **DFS** → `util.Stack` (LIFO)
- **BFS** → `util.Queue` (FIFO)
- **UCS** → `util.PriorityQueue`, priority = path cost *g*
- **A\*** → `util.PriorityQueue`, priority = *g + h*

## Setup

Requires Python 3.9–3.11.

```bash
conda create -n cs188 python=3.11
conda activate cs188
pip install numpy matplotlib
```

Verify the framework runs:

```bash
python pacman.py
```

## Running the autograder

Run a single question:

```bash
python autograder.py -q q1    # q1 ... q7
```

Run the full suite:

```bash
python autograder.py
```

### Try the agents live

```bash
python pacman.py -l mediumMaze -p SearchAgent -a fn=bfs
python pacman.py -l mediumCorners -p AStarCornersAgent
python pacman.py -l trickySearch -p AStarFoodSearchAgent
```

## Results

| Q | Task | Marks | Notes |
|---|------|-------|-------|
| Q1 | Depth First Search | 4 | Pass |
| Q2 | Breadth First Search | 4 | Pass |
| Q3 | Uniform Cost Search | 4 | Pass |
| Q4 | A\* Search | 4 | Pass |
| Q5 | Corners Problem | 8 | Pass |
| Q6 | Corners Heuristic | 8 | ≤ 1200 nodes on `mediumCorners` |
| Q7 | Food Heuristic | 8 | 4137 nodes on `trickySearch` (full marks) |

## Collaboration workflow

We use a protected `main` branch — all changes go through pull requests that
require one teammate's approval. 

## Attribution

The Pac-Man AI projects were developed at UC Berkeley
(http://ai.berkeley.edu). This repository is coursework and is not for
redistribution of solutions.
