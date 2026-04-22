// Monster AI
// Moves toward player, occasionally wanders, chases bait

class Monster {
  constructor(x, y, maze) {
    this.x = x;
    this.y = y;
    this.maze = maze;
    this.moveInterval = 4000;
    this.timer = null;
    this.baitTarget = null;
    this.baitTurnsLeft = 0;
    this.wanderChance = 0.15;
    this.isWandering = false;
    this.wanderSteps = 0;
    this.alive = true;
    this.isBlind = false;
    this.stunTurns = 0;
    this.onMove = null;
  }

  setBlind(blind) {
    this.isBlind = blind;
    if (blind) {
      this.baitTarget = null;
      this.baitTurnsLeft = 0;
      this.isWandering = false;
      this.wanderSteps = 0;
    }
  }

  start(getPlayerPos) {
    this.getPlayerPos = getPlayerPos;
    this.alive = true;
    this._lastMoveTime = Date.now();
    this._scheduleMove();
  }

  stop() {
    this.alive = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  _scheduleMove() {
    if (!this.alive) return;
    this.timer = setTimeout(() => {
      const now = Date.now();
      const elapsed = now - this._lastMoveTime;
      if (elapsed < this.moveInterval * 0.5) {
        this._scheduleMove();
        return;
      }
      this._lastMoveTime = now;
      this._doMove();
      this._scheduleMove();
    }, this.moveInterval);
  }

  _doMove() {
    if (!this.alive) return;

    if (this.stunTurns > 0) {
      this.stunTurns--;
      return;
    }

    if (this.isBlind) {
      this._moveRandom();
      if (this.onMove) this.onMove(this.x, this.y);
      return;
    }

    let targetX;
    let targetY;

    if (this.baitTarget && this.baitTurnsLeft > 0) {
      targetX = this.baitTarget.x;
      targetY = this.baitTarget.y;
      this.baitTurnsLeft--;

      if (this.x === targetX && this.y === targetY) {
        this.baitTarget = null;
        this.baitTurnsLeft = 0;
      }
    } else if (!this.isWandering && Math.random() < this.wanderChance) {
      this.isWandering = true;
      this.wanderSteps = 2 + Math.floor(Math.random() * 3);
      this._moveRandom();
      if (this.onMove) this.onMove(this.x, this.y);
      return;
    } else if (this.isWandering) {
      this.wanderSteps--;
      if (this.wanderSteps <= 0) {
        this.isWandering = false;
      }
      this._moveRandom();
      if (this.onMove) this.onMove(this.x, this.y);
      return;
    } else {
      const playerPos = this.getPlayerPos();
      targetX = playerPos.x;
      targetY = playerPos.y;
    }

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
      { x: 0, y: 1 }, { x: -1, y: 0 }
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

  stun(turns) {
    this.stunTurns = Math.max(this.stunTurns, turns);
    this.baitTarget = null;
    this.baitTurnsLeft = 0;
    this.isWandering = false;
    this.wanderSteps = 0;
  }

  getDistanceToPlayer() {
    const playerPos = this.getPlayerPos();
    return this.maze.getDistance(this.x, this.y, playerPos.x, playerPos.y);
  }
}
