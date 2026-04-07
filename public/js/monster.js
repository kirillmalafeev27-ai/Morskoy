// Monster AI
// Moves toward player on each player step (turn-based, not real-time)

class Monster {
  constructor(x, y, maze) {
    this.x = x;
    this.y = y;
    this.maze = maze;
    this.baitTarget = null; // {x, y} if bait is active
    this.baitTurnsLeft = 0;
    this.wanderChance = 0.15; // 15% chance to wander randomly (scare tactic)
    this.isWandering = false;
    this.wanderSteps = 0;
    this.alive = true;
    this.onMove = null; // callback
  }

  start(getPlayerPos) {
    this.getPlayerPos = getPlayerPos;
    this.alive = true;
  }

  stop() {
    this.alive = false;
  }

  // Called once per player move — monster takes exactly one step
  doStep() {
    if (!this.alive) return;

    let targetX, targetY;

    // If bait is active, go to bait
    if (this.baitTarget && this.baitTurnsLeft > 0) {
      targetX = this.baitTarget.x;
      targetY = this.baitTarget.y;
      this.baitTurnsLeft--;

      if (this.x === targetX && this.y === targetY) {
        this.baitTarget = null;
        this.baitTurnsLeft = 0;
      }
    }
    // Random wander (scare tactic)
    else if (!this.isWandering && Math.random() < this.wanderChance) {
      this.isWandering = true;
      this.wanderSteps = 2 + Math.floor(Math.random() * 3);
      this._moveRandom();
      if (this.onMove) this.onMove(this.x, this.y);
      return;
    }
    else if (this.isWandering) {
      this.wanderSteps--;
      if (this.wanderSteps <= 0) {
        this.isWandering = false;
      }
      this._moveRandom();
      if (this.onMove) this.onMove(this.x, this.y);
      return;
    }
    else {
      // Chase player
      const playerPos = this.getPlayerPos();
      targetX = playerPos.x;
      targetY = playerPos.y;
    }

    // Use BFS to move toward target
    this._moveToward(targetX, targetY);

    if (this.onMove) this.onMove(this.x, this.y);
  }

  _moveToward(tx, ty) {
    const path = this.maze.findPath(this.x, this.y, tx, ty);
    if (path && path.length > 0) {
      this.x = path[0].x;
      this.y = path[0].y;
    }
  }

  _moveRandom() {
    const dirs = [
      { x: 0, y: -1 }, { x: 1, y: 0 },
      { x: 0, y: 1 },  { x: -1, y: 0 }
    ];
    const validDirs = dirs.filter(d => {
      const nx = this.x + d.x;
      const ny = this.y + d.y;
      return nx >= 0 && nx < this.maze.width && ny >= 0 && ny < this.maze.height &&
             this.maze.grid[ny][nx] === 1;
    });

    if (validDirs.length > 0) {
      const dir = validDirs[Math.floor(Math.random() * validDirs.length)];
      this.x += dir.x;
      this.y += dir.y;
    }
  }

  setBait(x, y) {
    this.baitTarget = { x, y };
    this.baitTurnsLeft = 8;
    this.isWandering = false;
  }

  getDistanceToPlayer() {
    const playerPos = this.getPlayerPos();
    return this.maze.getDistance(this.x, this.y, playerPos.x, playerPos.y);
  }
}
