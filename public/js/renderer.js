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
    this.scene.fog = new THREE.Fog(isCreepy ? 0x050505 : 0x0a1628, 8, 35);

    // Set initial camera position
    this.camera.position.set(2, 20, 14);
    this.camera.lookAt(2, 0, 2);

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
    this.playerFillLight = null;

    // Visibility
    this.visibleRadius = 2;
    this.baseVisibleRadius = 2;

    // Camera shake
    this.shakeIntensity = 0;
    this.shakeDuration = 0;
    this.shakeTimer = 0;

    // Death animation state
    this.deathAnimating = false;
    this.deathTarget = null;

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
    this._clearScene();

    const T = this.TILE_SIZE;
    const wallGeo = new THREE.BoxGeometry(T, this.WALL_HEIGHT, T);
    const floorGeo = new THREE.PlaneGeometry(T, T);

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const posX = x * T;
        const posZ = y * T;

        if (maze.grid[y][x] === 0) {
          const wall = new THREE.Mesh(wallGeo, this.wallMaterial);
          wall.position.set(posX, this.WALL_HEIGHT / 2, posZ);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.scene.add(wall);
          this.wallMeshes.push(wall);
        } else {
          const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(posX, 0, posZ);
          floor.receiveShadow = true;
          this.scene.add(floor);
          this.floorMeshes.push(floor);
        }
      }
    }

    const ambient = new THREE.AmbientLight(
      this.isCreepy ? 0x221111 : 0x182838,
      this.isCreepy ? 0.15 : 0.3
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

    this.playerLight = new THREE.PointLight(
      this.isCreepy ? 0xff8833 : 0x99bbff,
      this.isCreepy ? 2.5 : 2.0,
      this.visibleRadius * T * 3,
      1.5
    );
    this.playerLight.position.set(x * T, 2.5, y * T);
    this.playerLight.castShadow = true;
    this.playerLight.shadow.mapSize.width = 512;
    this.playerLight.shadow.mapSize.height = 512;
    this.scene.add(this.playerLight);

    this.playerFillLight = new THREE.PointLight(0xffffff, 0.5, this.visibleRadius * T * 4, 2);
    this.playerFillLight.position.set(x * T, 8, y * T);
    this.scene.add(this.playerFillLight);
  }

  updatePlayer(x, y) {
    if (!this.playerMesh) return;
    const T = this.TILE_SIZE;
    const targetX = x * T;
    const targetZ = y * T;
    this.playerMesh.position.x += (targetX - this.playerMesh.position.x) * 0.2;
    this.playerMesh.position.z += (targetZ - this.playerMesh.position.z) * 0.2;
    this.playerLight.position.x = this.playerMesh.position.x;
    this.playerLight.position.z = this.playerMesh.position.z;

    if (this.playerFillLight) {
      this.playerFillLight.position.x = this.playerMesh.position.x;
      this.playerFillLight.position.z = this.playerMesh.position.z;
      this.playerFillLight.distance = this.visibleRadius * T * 4;
    }

    this.playerLight.distance = this.visibleRadius * T * 3;

    // Gentle player bob
    const time = this.clock.getElapsedTime();
    this.playerMesh.position.y = T * 0.3 + Math.sin(time * 2) * 0.05;
  }

  updateCamera(playerX, playerY, instant) {
    const T = this.TILE_SIZE;
    const targetX = playerX * T;
    const targetZ = playerY * T;

    const camTargetX = targetX;
    const camTargetY = 20;
    const camTargetZ = targetZ + 12;

    const lerp = instant ? 1.0 : 0.08;
    this.camera.position.x += (camTargetX - this.camera.position.x) * lerp;
    this.camera.position.y += (camTargetY - this.camera.position.y) * lerp;
    this.camera.position.z += (camTargetZ - this.camera.position.z) * lerp;

    // Camera shake
    if (this.shakeTimer > 0) {
      const progress = this.shakeTimer / this.shakeDuration;
      const intensity = this.shakeIntensity * progress;
      this.camera.position.x += (Math.random() - 0.5) * intensity;
      this.camera.position.y += (Math.random() - 0.5) * intensity * 0.5;
      this.camera.position.z += (Math.random() - 0.5) * intensity;
      this.shakeTimer -= 16; // approx per frame
    }

    if (this.playerMesh) {
      this.camera.lookAt(
        this.playerMesh.position.x,
        0,
        this.playerMesh.position.z
      );
    }
  }

  shakeCamera(intensity, duration) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  // ===== DETAILED MONSTER =====
  createMonster(x, y, index) {
    const T = this.TILE_SIZE;
    const group = new THREE.Group();

    const monsterColor = this.isCreepy ? 0x3a0000 : 0x8b0000;
    const monsterEmissive = this.isCreepy ? 0x330000 : 0x440000;

    // === TORSO (main body) - lumpy distorted mass ===
    const torsoGeo = new THREE.SphereGeometry(T * 0.35, 12, 10);
    this._distortGeometry(torsoGeo, 0.12);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: monsterColor, emissive: monsterEmissive,
      emissiveIntensity: 0.3, roughness: 0.7, metalness: 0.15,
    });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = T * 0.45;
    torso.scale.set(1, 1.2, 0.9);
    torso.castShadow = true;
    group.add(torso);

    // === HEAD - smaller lumpy sphere ===
    const headGeo = new THREE.SphereGeometry(T * 0.2, 10, 8);
    this._distortGeometry(headGeo, 0.08);
    const headMat = torsoMat.clone();
    headMat.color.setHex(this.isCreepy ? 0x4a0a0a : 0x9b1010);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, T * 0.8, -T * 0.1);
    head.castShadow = true;
    group.add(head);

    // === EYES - asymmetric glowing ===
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eye1Geo = new THREE.SphereGeometry(T * 0.055, 8, 8);
    const eye1 = new THREE.Mesh(eye1Geo, eyeMat);
    eye1.position.set(-T * 0.1, T * 0.85, -T * 0.28);
    group.add(eye1);

    const eye2Geo = new THREE.SphereGeometry(T * 0.04, 8, 8);
    const eye2 = new THREE.Mesh(eye2Geo, eyeMat);
    eye2.position.set(T * 0.08, T * 0.82, -T * 0.27);
    group.add(eye2);

    // Third eye (creepy only)
    if (this.isCreepy) {
      const eye3Geo = new THREE.SphereGeometry(T * 0.03, 6, 6);
      const eye3Mat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
      const eye3 = new THREE.Mesh(eye3Geo, eye3Mat);
      eye3.position.set(T * 0.02, T * 0.92, -T * 0.25);
      group.add(eye3);
    }

    // === MOUTH - jagged opening ===
    const mouthGeo = new THREE.TorusGeometry(T * 0.08, T * 0.025, 6, 8);
    this._distortGeometry(mouthGeo, 0.03);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x220000 });
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, T * 0.72, -T * 0.28);
    mouth.rotation.x = Math.PI * 0.1;
    group.add(mouth);

    // === ARMS/TENTACLES - twisted cylinders ===
    for (let side = -1; side <= 1; side += 2) {
      const armGroup = new THREE.Group();

      // Upper arm
      const armGeo = new THREE.CylinderGeometry(T * 0.06, T * 0.04, T * 0.4, 6);
      this._distortGeometry(armGeo, 0.03);
      const armMesh = new THREE.Mesh(armGeo, torsoMat);
      armMesh.rotation.z = side * 0.8;
      armMesh.position.y = -T * 0.1;
      armGroup.add(armMesh);

      // Forearm/claw
      const clawGeo = new THREE.ConeGeometry(T * 0.05, T * 0.2, 5);
      this._distortGeometry(clawGeo, 0.02);
      const clawMat = torsoMat.clone();
      clawMat.color.setHex(0x1a0000);
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(side * T * 0.15, -T * 0.25, 0);
      claw.rotation.z = side * 0.5;
      armGroup.add(claw);

      armGroup.position.set(side * T * 0.3, T * 0.5, 0);
      group.add(armGroup);
    }

    // === LEGS - stumpy, uneven ===
    for (let side = -1; side <= 1; side += 2) {
      const legGeo = new THREE.CylinderGeometry(T * 0.08, T * 0.06, T * 0.25, 6);
      this._distortGeometry(legGeo, 0.02);
      const leg = new THREE.Mesh(legGeo, torsoMat);
      leg.position.set(side * T * 0.15, T * 0.12, T * 0.05);
      group.add(leg);
    }

    // === SPIKES on back ===
    for (let i = 0; i < 4; i++) {
      const spikeGeo = new THREE.ConeGeometry(T * 0.04, T * 0.15 + Math.random() * T * 0.1, 4);
      const spikeMat = torsoMat.clone();
      spikeMat.color.setHex(0x2a0505);
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      spike.position.set(
        (Math.random() - 0.5) * T * 0.2,
        T * 0.7 + Math.random() * T * 0.15,
        T * 0.15 + Math.random() * T * 0.1
      );
      spike.rotation.x = -0.3 + Math.random() * 0.2;
      spike.rotation.z = (Math.random() - 0.5) * 0.4;
      group.add(spike);
    }

    // === DROOL/slime particles (small spheres underneath) ===
    for (let i = 0; i < 3; i++) {
      const dripGeo = new THREE.SphereGeometry(T * 0.015, 4, 4);
      const dripMat = new THREE.MeshBasicMaterial({ color: 0x44ff44, transparent: true, opacity: 0.6 });
      const drip = new THREE.Mesh(dripGeo, dripMat);
      drip.position.set(
        (Math.random() - 0.5) * T * 0.15,
        T * 0.65,
        -T * 0.3
      );
      drip.userData.dripOffset = Math.random() * Math.PI * 2;
      group.add(drip);
    }

    // Monster glow
    const monsterLight = new THREE.PointLight(
      this.isCreepy ? 0xff0000 : 0xff3300,
      this.isCreepy ? 0.4 : 0.25,
      T * 4, 2
    );
    monsterLight.position.set(0, T * 0.5, 0);
    group.add(monsterLight);

    group.position.set(x * T, 0, y * T);
    group.visible = false;
    group.userData.monsterIndex = index;
    this.scene.add(group);
    this.monsterMeshes.push(group);
    return group;
  }

  _distortGeometry(geo, amount) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i,
        pos.getX(i) + (Math.random() - 0.5) * amount,
        pos.getY(i) + (Math.random() - 0.5) * amount,
        pos.getZ(i) + (Math.random() - 0.5) * amount
      );
    }
    geo.computeVertexNormals();
  }

  updateMonster(index, x, y, isVisible, isRevealed) {
    if (index >= this.monsterMeshes.length) return;
    const T = this.TILE_SIZE;
    const mesh = this.monsterMeshes[index];
    const targetX = x * T;
    const targetZ = y * T;

    mesh.position.x += (targetX - mesh.position.x) * 0.15;
    mesh.position.z += (targetZ - mesh.position.z) * 0.15;

    const time = this.clock.getElapsedTime();

    // Body sway
    if (mesh.children[0]) {
      mesh.children[0].rotation.y = Math.sin(time * 1.5 + index) * 0.2;
      mesh.children[0].rotation.z = Math.sin(time * 1.2 + index * 0.5) * 0.1;
    }

    // Head bob
    if (mesh.children[1]) {
      mesh.children[1].position.y = T * 0.8 + Math.sin(time * 2.5 + index) * 0.06;
      mesh.children[1].rotation.x = Math.sin(time * 1.8) * 0.15;
    }

    // Arm swing (children 6 and 7 are arm groups)
    const armIndices = this.isCreepy ? [7, 8] : [6, 7];
    armIndices.forEach((ai, side) => {
      if (mesh.children[ai]) {
        mesh.children[ai].rotation.x = Math.sin(time * 2 + side * Math.PI) * 0.3;
        mesh.children[ai].rotation.z = Math.sin(time * 1.5 + side * Math.PI) * 0.15;
      }
    });

    // Drool drip animation
    mesh.children.forEach(child => {
      if (child.userData && child.userData.dripOffset !== undefined) {
        const dripPhase = (time * 2 + child.userData.dripOffset) % (Math.PI * 2);
        child.position.y = T * 0.65 - Math.abs(Math.sin(dripPhase)) * T * 0.1;
        child.material.opacity = 0.3 + Math.abs(Math.sin(dripPhase)) * 0.4;
      }
    });

    mesh.visible = isVisible || isRevealed;

    // Semi-transparent if revealed but not in visible range
    if (isRevealed && !isVisible) {
      mesh.traverse(child => {
        if (child.isMesh && child.material && !child.material.isMeshBasicMaterial) {
          if (!child.userData._origMat) {
            child.userData._origMat = child.material;
            child.material = child.material.clone();
          }
          child.material.transparent = true;
          child.material.opacity = 0.4 + Math.sin(time * 4) * 0.2;
        }
      });
    } else if (isVisible) {
      mesh.traverse(child => {
        if (child.isMesh && child.userData._origMat) {
          child.material = child.userData._origMat;
          delete child.userData._origMat;
        }
      });
    }
  }

  // ===== DEATH ANIMATION =====
  playDeathAnimation(monsterX, monsterY, callback) {
    this.deathAnimating = true;

    // Red overlay
    const overlay = document.getElementById('death-overlay');
    overlay.classList.add('active');

    // Camera shake
    this.shakeCamera(2.0, 1500);

    // Zoom camera toward monster
    const T = this.TILE_SIZE;
    this.deathTarget = { x: monsterX * T, z: monsterY * T };

    // Dim player light
    if (this.playerLight) {
      const flickerInterval = setInterval(() => {
        if (this.playerLight) {
          this.playerLight.intensity = Math.random() * 1.5;
        }
      }, 80);

      setTimeout(() => {
        clearInterval(flickerInterval);
        if (this.playerLight) this.playerLight.intensity = 0;
        this.deathAnimating = false;
        if (callback) callback();
      }, 1800);
    } else {
      setTimeout(() => {
        this.deathAnimating = false;
        if (callback) callback();
      }, 1800);
    }
  }

  resetDeathAnimation() {
    this.deathAnimating = false;
    this.deathTarget = null;
    const overlay = document.getElementById('death-overlay');
    if (overlay) overlay.classList.remove('active');
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
    this.playerFillLight = null;
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
    this.resetDeathAnimation();
  }
}
