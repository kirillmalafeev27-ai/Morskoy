// Three.js 3D Renderer
// Top-down angled view of dungeon with fog of war via lighting
// Uses GLB models from LowPolyDungeon pack + post-processing

class DungeonRenderer {
  constructor(canvas, isCreepy) {
    this.canvas = canvas;
    this.isCreepy = isCreepy;
    this.TILE_SIZE = 2;
    this.WALL_HEIGHT = 3;

    // Model cache
    this.modelCache = {};
    this.modelsLoaded = false;
    this.loader = new THREE.GLTFLoader();

    // Scene setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Background color
    this.bgColor = isCreepy ? 0x050505 : 0x0a1628;
    this.scene.background = new THREE.Color(this.bgColor);
    // Fog accounts for camera height (~23 units from scene).
    // near=21 keeps tiles at player visible, far=28 hides beyond 2 tiles.
    this.scene.fog = new THREE.Fog(this.bgColor, 21, 28);

    // Set initial camera position
    this.camera.position.set(2, 20, 14);
    this.camera.lookAt(2, 0, 2);

    // Post-processing
    this.composer = null;
    this._initPostProcessing();

    // Particles
    this.dustParticles = null;
    this.torchParticles = [];

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

  _initPostProcessing() {
    try {
      if (!THREE.EffectComposer) return; // CDN not loaded

      this.composer = new THREE.EffectComposer(this.renderer);

      // Render pass
      const renderPass = new THREE.RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      // Bloom - makes lights glow beautifully
      const bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        this.isCreepy ? 0.5 : 0.3,  // strength
        0.4,                          // radius
        0.7                           // threshold
      );
      this.composer.addPass(bloomPass);
      this.bloomPass = bloomPass;

      // Vignette - darkens edges, focuses attention on center
      const vignetteShader = {
        uniforms: {
          tDiffuse: { value: null },
          darkness: { value: this.isCreepy ? 1.2 : 0.8 },
          offset: { value: 1.0 },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D tDiffuse;
          uniform float darkness;
          uniform float offset;
          varying vec2 vUv;
          void main() {
            vec4 texel = texture2D(tDiffuse, vUv);
            vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
            float vignette = 1.0 - dot(uv, uv);
            vignette = clamp(pow(vignette, darkness), 0.0, 1.0);
            gl_FragColor = vec4(texel.rgb * vignette, texel.a);
          }
        `
      };
      const vignettePass = new THREE.ShaderPass(vignetteShader);
      this.composer.addPass(vignettePass);

      // Film grain for creepy mode
      if (this.isCreepy) {
        const grainShader = {
          uniforms: {
            tDiffuse: { value: null },
            time: { value: 0 },
            amount: { value: 0.03 },
          },
          vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float time;
            uniform float amount;
            varying vec2 vUv;
            float random(vec2 co) {
              return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
            }
            void main() {
              vec4 color = texture2D(tDiffuse, vUv);
              float grain = random(vUv + time) * amount;
              color.rgb += grain - amount * 0.5;
              gl_FragColor = color;
            }
          `
        };
        this.grainPass = new THREE.ShaderPass(grainShader);
        this.composer.addPass(this.grainPass);
      }
    } catch (e) {
      console.warn('Post-processing unavailable:', e);
      this.composer = null;
    }
  }

  _initMaterials() {
    // Generate procedural stone texture
    const stoneTexture = this._generateStoneTexture(this.isCreepy);
    const floorTexture = this._generateFloorTexture(this.isCreepy);

    if (this.isCreepy) {
      this.wallMaterial = new THREE.MeshStandardMaterial({
        map: stoneTexture,
        color: 0x8a7a6a,
        roughness: 0.85,
        metalness: 0.05,
        bumpMap: stoneTexture,
        bumpScale: 0.05,
      });
      this.floorMaterial = new THREE.MeshStandardMaterial({
        map: floorTexture,
        color: 0x6a5a4a,
        roughness: 0.9,
        metalness: 0.0,
        bumpMap: floorTexture,
        bumpScale: 0.03,
      });
    } else {
      this.wallMaterial = new THREE.MeshStandardMaterial({
        map: stoneTexture,
        color: 0x7a9aba,
        roughness: 0.75,
        metalness: 0.15,
        bumpMap: stoneTexture,
        bumpScale: 0.04,
      });
      this.floorMaterial = new THREE.MeshStandardMaterial({
        map: floorTexture,
        color: 0x6a7a8a,
        roughness: 0.8,
        metalness: 0.1,
        bumpMap: floorTexture,
        bumpScale: 0.02,
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

  loadModels(callback) {
    const modelList = {
      wall1: 'assets/models/Dungeon_Wall_Var1.glb',
      wall2: 'assets/models/Dungeon_Wall_Var2.glb',
      floor: 'assets/models/FloorTIle.glb',
      hallway: 'assets/models/Dungeon_Straight.glb',
      torch: 'assets/models/Torch_Wall.glb',
      chest: 'assets/models/Chest.glb',
      barrel: 'assets/models/Barrel_Closed.glb',
      bone: 'assets/models/Bone.glb',
      amphora: 'assets/models/Amphora.glb',
      pillar: 'assets/models/Pillar.glb',
      crystal: 'assets/models/CrystalBall.glb',
    };

    let loaded = 0;
    const total = Object.keys(modelList).length;

    for (const [key, path] of Object.entries(modelList)) {
      this.loader.load(
        path,
        (gltf) => {
          this.modelCache[key] = gltf.scene;
          loaded++;
          if (loaded >= total) {
            this.modelsLoaded = true;
            if (callback) callback();
          }
        },
        undefined,
        (err) => {
          console.warn(`Failed to load model ${key}:`, err);
          loaded++;
          if (loaded >= total) {
            this.modelsLoaded = true;
            if (callback) callback();
          }
        }
      );
    }
  }

  _cloneModel(key, applyMaterial) {
    const model = this.modelCache[key];
    if (!model) return null;
    const clone = model.clone();
    clone.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (applyMaterial) {
          child.material = applyMaterial;
        }
      }
    });
    return clone;
  }

  buildMaze(maze) {
    this._clearScene();

    const T = this.TILE_SIZE;
    const wallGeo = new THREE.BoxGeometry(T, this.WALL_HEIGHT, T);
    const floorGeo = new THREE.PlaneGeometry(T, T);
    const useModels = this.modelsLoaded;

    // Determine model scale for decorations/floor
    let modelScale = 0.5;
    if (useModels && this.modelCache.floor) {
      const box = new THREE.Box3().setFromObject(this.modelCache.floor);
      const size = box.getSize(new THREE.Vector3());
      if (size.x > 0) modelScale = T / Math.max(size.x, size.z);
    }

    // Decoration random seed per cell
    const decorTypes = ['bone', 'amphora', 'barrel'];
    let decorCount = 0;
    const maxDecor = 30;

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const posX = x * T;
        const posZ = y * T;

        if (maze.grid[y][x] === 0) {
          // WALL - always use solid BoxGeometry for reliable gap-free walls
          const wall = new THREE.Mesh(wallGeo, this.wallMaterial);
          wall.position.set(posX, this.WALL_HEIGHT / 2, posZ);
          wall.castShadow = true;
          wall.receiveShadow = true;
          this.scene.add(wall);
          this.wallMeshes.push(wall);
        } else {
          // FLOOR
          const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
          floor.rotation.x = -Math.PI / 2;
          floor.position.set(posX, 0, posZ);
          floor.receiveShadow = true;
          this.scene.add(floor);
          this.floorMeshes.push(floor);

          // Random decoration objects in corridors (sparse)
          if (useModels && decorCount < maxDecor && Math.random() < 0.04) {
            const decorKey = decorTypes[Math.floor(Math.random() * decorTypes.length)];
            const decor = this._cloneModel(decorKey);
            if (decor) {
              decor.scale.setScalar(modelScale * 0.6);
              decor.position.set(
                posX + (Math.random() - 0.5) * T * 0.4,
                0,
                posZ + (Math.random() - 0.5) * T * 0.4
              );
              decor.rotation.y = Math.random() * Math.PI * 2;
              this.scene.add(decor);
              decorCount++;
            }
          }
        }
      }
    }

    // Minimal ambient - fog of war means most light comes from player
    const ambient = new THREE.AmbientLight(
      this.isCreepy ? 0x221111 : 0x182838,
      this.isCreepy ? 0.08 : 0.12
    );
    this.scene.add(ambient);

    // Floating dust particles in the whole maze
    this._createDustParticles(maze);

    // Wall-mounted torches at intersections
    this._createTorches(maze);
  }

  _createDustParticles(maze) {
    const T = this.TILE_SIZE;
    const count = 300;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = Math.random() * maze.width * T;
      positions[i * 3 + 1] = 0.2 + Math.random() * 2.5;
      positions[i * 3 + 2] = Math.random() * maze.height * T;
      sizes[i] = 0.02 + Math.random() * 0.04;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      color: this.isCreepy ? 0x886644 : 0x8899bb,
      size: 0.06,
      transparent: true,
      opacity: 0.3,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.dustParticles = new THREE.Points(geo, mat);
    this.scene.add(this.dustParticles);
  }

  _createTorches(maze) {
    const T = this.TILE_SIZE;
    this.torchParticles = [];
    let torchCount = 0;

    // Place torches at some corridor junctions (not too many for perf)
    for (let y = 2; y < maze.height - 2; y += 4) {
      for (let x = 2; x < maze.width - 2; x += 4) {
        if (maze.grid[y][x] !== 1) continue;

        // Check if it's near a wall
        let nearWall = false;
        const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
        for (const [dx, dy] of dirs) {
          if (maze.grid[y+dy] && maze.grid[y+dy][x+dx] === 0) {
            nearWall = true;
            break;
          }
        }
        if (!nearWall) continue;
        if (torchCount > 30) break;

        // Torch = point light + small emissive mesh + particle emitter info
        const posX = x * T;
        const posZ = y * T;

        // Torch model or fallback
        let flame;
        if (this.modelsLoaded && this.modelCache.torch) {
          const torchModel = this._cloneModel('torch');
          if (torchModel) {
            const box = new THREE.Box3().setFromObject(torchModel);
            const tSize = box.getSize(new THREE.Vector3());
            const tScale = (T * 0.5) / Math.max(tSize.x, tSize.z, 0.01);
            torchModel.scale.setScalar(tScale);
            torchModel.position.set(posX, 1.5, posZ);
            torchModel.rotation.y = Math.random() * Math.PI * 2;
            this.scene.add(torchModel);
          }
        }

        // Flame glow (always add for lighting effect)
        const flameGeo = new THREE.SphereGeometry(0.1, 6, 6);
        const flameMat = new THREE.MeshBasicMaterial({
          color: this.isCreepy ? 0xff4400 : 0xffaa44,
          transparent: true,
          opacity: 0.8,
        });
        flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(posX, 2.2, posZ);
        this.scene.add(flame);

        // Torch light
        const torchLight = new THREE.PointLight(
          this.isCreepy ? 0xff4400 : 0xffaa44,
          0.8, T * 6, 1.5
        );
        torchLight.position.set(posX, 2.3, posZ);
        this.scene.add(torchLight);

        this.torchParticles.push({
          flame, light: torchLight,
          x: posX, z: posZ, offset: Math.random() * Math.PI * 2
        });
        torchCount++;
      }
    }
  }

  _updateParticles() {
    const time = this.clock.getElapsedTime();

    // Dust drifting
    if (this.dustParticles) {
      const pos = this.dustParticles.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i);
        y += Math.sin(time * 0.5 + i * 0.1) * 0.002;
        pos.setX(i, pos.getX(i) + Math.sin(time * 0.3 + i) * 0.003);
        if (y > 2.8) y = 0.2;
        if (y < 0.1) y = 2.7;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    // Torch flicker
    for (const torch of this.torchParticles) {
      const flicker = 0.7 + Math.sin(time * 8 + torch.offset) * 0.15
                     + Math.sin(time * 13 + torch.offset * 2) * 0.1;
      torch.light.intensity = 0.8 * flicker;
      torch.flame.scale.setScalar(0.8 + Math.sin(time * 6 + torch.offset) * 0.3);
      torch.flame.material.opacity = 0.5 + flicker * 0.3;
    }
  }

  createPlayer(x, y) {
    const T = this.TILE_SIZE;
    const geo = new THREE.SphereGeometry(T * 0.3, 16, 16);
    this.playerMesh = new THREE.Mesh(geo, this.playerMaterial);
    this.playerMesh.position.set(x * T, T * 0.3, y * T);
    this.playerMesh.castShadow = true;
    this.scene.add(this.playerMesh);

    // Main player torch - illuminates exactly the visible radius
    const lightRange = (this.visibleRadius + 0.5) * T;
    this.playerLight = new THREE.PointLight(
      this.isCreepy ? 0xff8833 : 0x99bbff,
      this.isCreepy ? 2.0 : 1.8,
      lightRange * 2,
      1.5
    );
    this.playerLight.position.set(x * T, 2.5, y * T);
    this.playerLight.castShadow = true;
    this.playerLight.shadow.mapSize.width = 512;
    this.playerLight.shadow.mapSize.height = 512;
    this.scene.add(this.playerLight);

    // Fill light from above - softer, matches visible radius
    this.playerFillLight = new THREE.PointLight(0xffffff, 0.4, lightRange * 2.5, 1.8);
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

    // Light range tracks visibleRadius (expands with Artikel bonus)
    const lightRange = (this.visibleRadius + 0.5) * T;
    if (this.playerFillLight) {
      this.playerFillLight.position.x = this.playerMesh.position.x;
      this.playerFillLight.position.z = this.playerMesh.position.z;
      this.playerFillLight.distance = lightRange * 2.5;
    }

    this.playerLight.distance = lightRange * 2;

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

  _generateStoneTexture(isCreepy) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base color
    ctx.fillStyle = isCreepy ? '#6a5838' : '#6a7a8a';
    ctx.fillRect(0, 0, size, size);

    // Stone block lines
    ctx.strokeStyle = isCreepy ? '#4a3818' : '#5a6a7a';
    ctx.lineWidth = 2;

    // Horizontal mortar lines
    for (let y = 0; y < size; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    // Vertical mortar lines (offset every other row)
    for (let y = 0; y < size; y += 32) {
      const offset = ((y / 32) % 2) * 16;
      for (let x = offset; x < size; x += 32) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 32);
        ctx.stroke();
      }
    }

    // Noise/grime
    for (let i = 0; i < 500; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const brightness = Math.random() * 30 - 15;
      const b = isCreepy ? 70 + brightness : 100 + brightness;
      ctx.fillStyle = `rgb(${b},${b * 0.8},${b * 0.7})`;
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
  }

  _generateFloorTexture(isCreepy) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base
    ctx.fillStyle = isCreepy ? '#4a3a2a' : '#4a5a6a';
    ctx.fillRect(0, 0, size, size);

    // Floor tile grid
    ctx.strokeStyle = isCreepy ? '#3a2a1a' : '#3a4a5a';
    ctx.lineWidth = 1;
    const tileSize = 32;
    for (let x = 0; x < size; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y < size; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    // Cracks and dirt
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = isCreepy ? '#0a0804' : '#1a2a35';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      let x = Math.random() * size;
      let y = Math.random() * size;
      ctx.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (Math.random() - 0.5) * 20;
        y += (Math.random() - 0.5) * 20;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Subtle stains
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const a = Math.random() * 0.1;
      ctx.fillStyle = isCreepy ? `rgba(20,10,5,${a})` : `rgba(10,20,30,${a})`;
      ctx.fillRect(x, y, 3, 3);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    return texture;
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

    // Use Chest model if available
    if (this.modelsLoaded && this.modelCache.chest) {
      const chestModel = this._cloneModel('chest');
      if (chestModel) {
        const box = new THREE.Box3().setFromObject(chestModel);
        const size = box.getSize(new THREE.Vector3());
        const scale = (T * 0.4) / Math.max(size.x, size.z);
        chestModel.scale.setScalar(scale);
        chestModel.position.y = 0;
        group.add(chestModel);
      }
    }

    // Always add a crystal on top / glow indicator
    const crystalGeo = new THREE.OctahedronGeometry(T * 0.12, 0);
    const crystalMesh = new THREE.Mesh(crystalGeo, this.treasureMaterial);
    crystalMesh.position.y = T * 0.35;
    crystalMesh.castShadow = true;
    group.add(crystalMesh);

    // Glow
    const light = new THREE.PointLight(0xffd700, 1.0, T * 6, 1.5);
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
    this._updateFogForRadius();
  }

  resetVisibleRadius() {
    this.visibleRadius = this.baseVisibleRadius;
    this._updateFogForRadius();
  }

  _updateFogForRadius() {
    // Camera is ~23 units from scene center. Fog distance = camera distance to ground tiles.
    // Base: near=21, far=28 for 2-tile radius. Adjust proportionally for other radii.
    const baseNear = 21;
    const baseFar = 28;
    const ratio = this.visibleRadius / this.baseVisibleRadius;
    this.scene.fog.near = baseNear - 2 + ratio * 2;
    this.scene.fog.far = baseFar - 4 + ratio * 4;
  }

  isInVisibleRange(playerX, playerY, cellX, cellY) {
    const dx = Math.abs(playerX - cellX);
    const dy = Math.abs(playerY - cellY);
    return Math.max(dx, dy) <= this.visibleRadius;
  }

  render() {
    // Update particles every frame
    this._updateParticles();

    // Update grain time uniform
    if (this.grainPass) {
      this.grainPass.uniforms.time.value = this.clock.getElapsedTime();
    }

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
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
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  dispose() {
    this.stopLoop();
    this._clearScene();
    this.renderer.dispose();
    this.resetDeathAnimation();
  }
}
