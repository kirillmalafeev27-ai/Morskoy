// Three.js 3D Renderer
// Top-down angled view of dungeon with fog of war via lighting

class DungeonRenderer {
  constructor(canvas, isCreepy) {
    this.canvas = canvas;
    this.isCreepy = isCreepy;
    this.TILE_SIZE = 2;
    this.WALL_HEIGHT = 3;

    // Scene setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Background color
    this.scene.background = new THREE.Color(isCreepy ? 0x050505 : 0x0a1628);
    this.scene.fog = new THREE.Fog(isCreepy ? 0x050505 : 0x0a1628, 5, 18);

    // Materials
    this._initMaterials();

    // Object groups
    this.wallMeshes = [];
    this.floorMeshes = [];
    this.treasureMeshes = [];
    this.monsterMeshes = [];
    this.baitMesh = null;
    this.playerMesh = null;
    this.playerLight = null;
    this.revealLight = null;

    // Visibility
    this.visibleRadius = 2;
    this.baseVisibleRadius = 2;

    // Animation
    this.clock = new THREE.Clock();
    this.animationId = null;

    window.addEventListener('resize', () => this._onResize());
  }

  _initMaterials() {
    if (this.isCreepy) {
      this.wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a1a0a,
        roughness: 0.9,
        metalness: 0.1,
      });
      this.floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1210,
        roughness: 0.95,
        metalness: 0.0,
      });
    } else {
      this.wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x3a5a7a,
        roughness: 0.7,
        metalness: 0.2,
      });
      this.floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a3a4a,
        roughness: 0.8,
        metalness: 0.1,
      });
    }

    this.treasureMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xffa000,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.8,
    });

    this.monsterMaterial = new THREE.MeshStandardMaterial({
      color: this.isCreepy ? 0x3a0000 : 0x8b0000,
      emissive: this.isCreepy ? 0x330000 : 0x440000,
      emissiveIntensity: 0.3,
      roughness: 0.6,
      metalness: 0.2,
    });

    this.baitMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff88,
      emissive: 0x00aa44,
      emissiveIntensity: 0.6,
      roughness: 0.4,
    });

    this.playerMaterial = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x2244aa,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.3,
    });
  }

  buildMaze(maze) {
    // Clear previous
    this._clearScene();

    const T = this.TILE_SIZE;
    const wallGeo = new THREE.BoxGeometry(T, this.WALL_HEIGHT, T);
    const floorGeo = new THREE.PlaneGeometry(T, T);

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const posX = x * T;
        const posZ = y * T;

        if (maze.grid[y][x] === 0) {
          // Wall
          const wall = new THREE.Mesh(wallGeo, this.wallMaterial);
          wall.position.set(posX, this.WALL_HEIGHT / 2, posZ);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.scene.add(wall);
          this.wallMeshes.push(wall);
        } else {
          // Floor
          const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(posX, 0, posZ);
          floor.receiveShadow = true;
          this.scene.add(floor);
          this.floorMeshes.push(floor);
        }
      }
    }

    // Ceiling (large plane above)
    const ceilGeo = new THREE.PlaneGeometry(maze.width * T + 10, maze.height * T + 10);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: this.isCreepy ? 0x0a0808 : 0x1a2a3a,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(
      (maze.width * T) / 2 - T / 2,
      this.WALL_HEIGHT + 0.1,
      (maze.height * T) / 2 - T / 2
    );
    this.scene.add(ceiling);

    // Tiny ambient light so it's not pitch black
    const ambient = new THREE.AmbientLight(
      this.isCreepy ? 0x110808 : 0x0a1020,
      this.isCreepy ? 0.05 : 0.15
    );
    this.scene.add(ambient);
  }

  createPlayer(x, y) {
    const T = this.TILE_SIZE;
    const geo = new THREE.SphereGeometry(T * 0.3, 16, 16);
    this.playerMesh = new THREE.Mesh(geo, this.playerMaterial);
    this.playerMesh.position.set(x * T, T * 0.3, y * T);
    this.playerMesh.castShadow = true;
    this.scene.add(this.playerMesh);

    // Player torch light
    this.playerLight = new THREE.PointLight(
      this.isCreepy ? 0xff6600 : 0x88aaff,
      this.isCreepy ? 1.5 : 1.2,
      this.visibleRadius * T * 2.5,
      2
    );
    this.playerLight.position.set(x * T, 2.5, y * T);
    this.playerLight.castShadow = true;
    this.playerLight.shadow.mapSize.width = 512;
    this.playerLight.shadow.mapSize.height = 512;
    this.scene.add(this.playerLight);
  }

  updatePlayer(x, y) {
    if (!this.playerMesh) return;
    const T = this.TILE_SIZE;
    const targetX = x * T;
    const targetZ = y * T;
    // Smooth interpolation
    this.playerMesh.position.x += (targetX - this.playerMesh.position.x) * 0.2;
    this.playerMesh.position.z += (targetZ - this.playerMesh.position.z) * 0.2;
    this.playerLight.position.x = this.playerMesh.position.x;
    this.playerLight.position.z = this.playerMesh.position.z;

    // Update light range based on visibility
    this.playerLight.distance = this.visibleRadius * T * 2.5;
  }

  updateCamera(playerX, playerY) {
    const T = this.TILE_SIZE;
    const targetX = playerX * T;
    const targetZ = playerY * T;

    // Angled top-down view
    const camTargetX = targetX;
    const camTargetY = 18;
    const camTargetZ = targetZ + 10;

    this.camera.position.x += (camTargetX - this.camera.position.x) * 0.08;
    this.camera.position.y += (camTargetY - this.camera.position.y) * 0.08;
    this.camera.position.z += (camTargetZ - this.camera.position.z) * 0.08;

    this.camera.lookAt(
      this.playerMesh.position.x,
      0,
      this.playerMesh.position.z
    );
  }

  createMonster(x, y, index) {
    const T = this.TILE_SIZE;

    const group = new THREE.Group();

    // Body - distorted sphere
    const bodyGeo = new THREE.SphereGeometry(T * 0.4, 8, 6);
    // Distort vertices for ugly look
    const positions = bodyGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const px = positions.getX(i);
      const py = positions.getY(i);
      const pz = positions.getZ(i);
      positions.setXYZ(i,
        px + (Math.random() - 0.5) * 0.15,
        py + (Math.random() - 0.5) * 0.15,
        pz + (Math.random() - 0.5) * 0.15
      );
    }
    bodyGeo.computeVertexNormals();

    const body = new THREE.Mesh(bodyGeo, this.monsterMaterial);
    body.position.y = T * 0.4;
    body.castShadow = true;
    group.add(body);

    // Eyes - two glowing red dots
    const eyeGeo = new THREE.SphereGeometry(T * 0.06, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
    eye1.position.set(-T * 0.12, T * 0.5, -T * 0.3);
    group.add(eye1);
    const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
    eye2.position.set(T * 0.12, T * 0.5, -T * 0.3);
    group.add(eye2);

    // Monster glow
    const monsterLight = new THREE.PointLight(0xff0000, 0.3, T * 3, 2);
    monsterLight.position.set(0, T * 0.5, 0);
    group.add(monsterLight);

    group.position.set(x * T, 0, y * T);
    group.visible = false; // hidden by default (fog of war)
    this.scene.add(group);
    this.monsterMeshes.push(group);
    return group;
  }

  updateMonster(index, x, y, isVisible, isRevealed) {
    if (index >= this.monsterMeshes.length) return;
    const T = this.TILE_SIZE;
    const mesh = this.monsterMeshes[index];
    const targetX = x * T;
    const targetZ = y * T;

    mesh.position.x += (targetX - mesh.position.x) * 0.15;
    mesh.position.z += (targetZ - mesh.position.z) * 0.15;

    // Wobble animation
    const time = this.clock.getElapsedTime();
    mesh.children[0].rotation.y = Math.sin(time * 2 + index) * 0.3;
    mesh.children[0].position.y = this.TILE_SIZE * 0.4 + Math.sin(time * 3 + index) * 0.1;

    mesh.visible = isVisible || isRevealed;

    // If revealed but not in visible range, make semi-transparent
    if (isRevealed && !isVisible) {
      mesh.children[0].material = mesh.children[0].material.clone();
      mesh.children[0].material.transparent = true;
      mesh.children[0].material.opacity = 0.5 + Math.sin(time * 4) * 0.2;
    } else if (mesh.children[0].material.transparent) {
      mesh.children[0].material.transparent = false;
      mesh.children[0].material.opacity = 1;
    }
  }

  createTreasure(x, y, index) {
    const T = this.TILE_SIZE;
    const group = new THREE.Group();

    // Diamond shape
    const geo = new THREE.OctahedronGeometry(T * 0.2, 0);
    const mesh = new THREE.Mesh(geo, this.treasureMaterial);
    mesh.position.y = T * 0.3;
    mesh.castShadow = true;
    group.add(mesh);

    // Glow
    const light = new THREE.PointLight(0xffd700, 0.4, T * 3, 2);
    light.position.set(0, T * 0.3, 0);
    group.add(light);

    group.position.set(x * T, 0, y * T);
    group.visible = false;
    this.scene.add(group);
    this.treasureMeshes.push(group);
    return group;
  }

  updateTreasure(index, isVisible, isCollected) {
    if (index >= this.treasureMeshes.length) return;
    const mesh = this.treasureMeshes[index];

    if (isCollected) {
      mesh.visible = false;
      return;
    }

    mesh.visible = isVisible;

    // Spin and float
    const time = this.clock.getElapsedTime();
    mesh.children[0].rotation.y = time * 2 + index;
    mesh.children[0].position.y = this.TILE_SIZE * 0.3 + Math.sin(time * 2 + index * 2) * 0.15;
  }

  placeBait(x, y) {
    if (this.baitMesh) {
      this.scene.remove(this.baitMesh);
    }
    const T = this.TILE_SIZE;
    const geo = new THREE.TorusGeometry(T * 0.15, T * 0.05, 8, 16);
    this.baitMesh = new THREE.Mesh(geo, this.baitMaterial);
    this.baitMesh.position.set(x * T, T * 0.1, y * T);
    this.baitMesh.rotation.x = Math.PI / 2;
    this.scene.add(this.baitMesh);
  }

  removeBait() {
    if (this.baitMesh) {
      this.scene.remove(this.baitMesh);
      this.baitMesh = null;
    }
  }

  setVisibleRadius(radius) {
    this.visibleRadius = radius;
  }

  resetVisibleRadius() {
    this.visibleRadius = this.baseVisibleRadius;
  }

  // Check if a cell is within player's visible radius
  isInVisibleRange(playerX, playerY, cellX, cellY) {
    const dx = Math.abs(playerX - cellX);
    const dy = Math.abs(playerY - cellY);
    return Math.max(dx, dy) <= this.visibleRadius;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  startLoop(updateCallback) {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      updateCallback();
      this.render();
    };
    animate();
  }

  stopLoop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  _clearScene() {
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
    this.wallMeshes = [];
    this.floorMeshes = [];
    this.treasureMeshes = [];
    this.monsterMeshes = [];
    this.baitMesh = null;
    this.playerMesh = null;
    this.playerLight = null;
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  dispose() {
    this.stopLoop();
    this._clearScene();
    this.renderer.dispose();
  }
}
