import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module";
import { XrInput } from "./utils/xrInput";
import { Object3D, Object3DEventMap } from "three";
import { GripSystem } from "./mechanics/GripSystem";
import { BarspinMechanic } from "./mechanics/BarspinMechanic";

export class Context {
  frame: number = 0;
  cube?: THREE.Mesh;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cameraRig: THREE.Group;
  renderer: THREE.WebGLRenderer;
  stats: Stats;
  xrInput: XrInput;
  gripSystem: GripSystem;
  barspinMechanic: BarspinMechanic;
  elapsedTime: number;
  deltaTime: number;
  clock: THREE.Clock;
  controls: any;
  handlebars?: Object3D<Object3DEventMap>;
  leftGripMarker?: THREE.Mesh;
  rightGripMarker?: THREE.Mesh;
  isInVR: boolean = false;

  // Handlebar rotation control
  targetHandlebarRotation: number = 0;
  currentHandlebarRotation: number = 0;
  handlebarRotationSmoothing: number = 0.15; // Lerp factor for smooth rotation
  maxHandlebarRotation: number = Math.PI / 2; // ±90 degrees constraint

  // BMX rider configuration
  static readonly RIDER_HEAD_HEIGHT = 1.3; // Height when seated on BMX (meters)
  static readonly HANDLEBAR_DISTANCE = 0.5; // Distance from rider to handlebars (meters)
  static readonly HANDLEBAR_HEIGHT = 1.0; // Height of handlebars from ground (meters)

  constructor() {
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // this.renderer.colorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ReinhardToneMapping;

    this.scene = new THREE.Scene();

    // Create camera rig to represent rider's body position on BMX
    this.cameraRig = new THREE.Group();
    this.scene.add(this.cameraRig);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
    this.camera.near = 0.1;
    this.camera.far = 100;

    // Position camera at BMX rider's head height in riding position
    // When not in VR, offset slightly for desktop debugging view
    this.camera.position.set(0, Context.RIDER_HEAD_HEIGHT, 2);
    this.cameraRig.add(this.camera);

    // Position camera rig at origin - this represents the BMX position
    this.cameraRig.position.set(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, Context.RIDER_HEAD_HEIGHT, 0);
    this.controls.update();

    this.scene.background = new THREE.Color("skyblue");
    const gridHelper = new THREE.GridHelper(10, 10);
    this.scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(10);
    this.scene.add(axesHelper);

    this.buildScene();

    this.stats = new Stats();
    document.body.appendChild(this.stats.dom);

    // VR
    document.body.appendChild(VRButton.createButton(this.renderer));
    this.renderer.xr.enabled = true;
    this.xrInput = new XrInput(this);

    // Initialize grip system
    this.gripSystem = new GripSystem(this);

    // Initialize barspin mechanic (must be after gripSystem)
    this.barspinMechanic = new BarspinMechanic(this);

    // Setup VR session listeners for camera adjustment
    this.setupVRSessionListeners();

    //
    this.frame = 0;
    this.elapsedTime = 0;
    this.deltaTime = 0;
    this.clock = new THREE.Clock();

    window.addEventListener("resize", () => this.onResize(), false);

    this.renderer.setAnimationLoop(() => this.onAnimate());
  }

  buildScene() {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(10, 10, -10);
    this.scene.add(directionalLight);

    // Ground
    const box = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: "green" }));
    box.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), Math.PI / 2.0);
    box.position.set(0, -0.001, 0);
    this.scene.add(box);

    // Add Handlebars
    const loader = new THREE.ObjectLoader();
    loader.load("/scene-assets/Handlebars.json", (handlebars): void => {
      this.handlebars = handlebars;
      // Add handlebars to camera rig so they move with the rider
      this.cameraRig.add(handlebars);

      // Create grip markers after handlebars are loaded
      this.createGripMarkers();
    });

    // Mirror
    const mirror = new Reflector(new THREE.PlaneGeometry(3, 4), {
      color: new THREE.Color(0xa0a0a0),
      textureWidth: window.innerWidth * window.devicePixelRatio * 2,
      textureHeight: window.innerHeight * window.devicePixelRatio * 2,
    });
    mirror.position.set(0, 2, -2);
    // this kills the fps!
    // this.scene.add(mirror);
  }

  createGripMarkers() {
    if (!this.handlebars) return;

    // Create visual markers for grip positions
    // These are spheres that show where controllers should grab
    const gripGeometry = new THREE.SphereGeometry(0.03, 16, 16);
    const gripMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.7
    });

    // Left grip marker (positioned on left handlebar grip)
    this.leftGripMarker = new THREE.Mesh(gripGeometry, gripMaterial);
    this.leftGripMarker.position.set(-0.3, 0, 0); // Left side, relative to handlebars
    this.handlebars.add(this.leftGripMarker);

    // Right grip marker (positioned on right handlebar grip)
    this.rightGripMarker = new THREE.Mesh(gripGeometry, gripMaterial.clone());
    this.rightGripMarker.position.set(0.3, 0, 0); // Right side, relative to handlebars
    this.handlebars.add(this.rightGripMarker);

    console.log('Grip markers created at handlebar positions');

    // Initialize grip system zones now that markers are ready
    this.gripSystem.initializeGripZones();
  }

  setupVRSessionListeners() {
    // Listen for VR session start
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.isInVR = true;
      // In VR mode, reset camera position to origin relative to rig
      // WebXR will handle head tracking from this base position
      this.camera.position.set(0, 0, 0);
      // Disable orbit controls in VR
      this.controls.enabled = false;
      console.log('Entered VR mode - Camera positioned at BMX rider perspective');
    });

    // Listen for VR session end
    this.renderer.xr.addEventListener('sessionend', () => {
      this.isInVR = false;
      // Restore desktop camera position for debugging
      this.camera.position.set(0, 1.3, 2);
      // Re-enable orbit controls
      this.controls.enabled = true;
      console.log('Exited VR mode - Camera restored to desktop view');
    });
  }

  onAnimate() {
    this.frame++;
    this.elapsedTime = this.clock.elapsedTime;
    this.deltaTime = this.clock.getDelta();
    this.xrInput.onAnimate();

    // Update grip system
    this.gripSystem.update();

    // Update barspin mechanic
    this.barspinMechanic.update(this.deltaTime);

    // Only update controls when not in VR
    if (!this.isInVR) {
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
    this.stats.update();

    // Update handlebar position and scale
    if (this.handlebars) {
      // Position handlebars relative to camera rig (rider position)
      // BMX handlebars should be:
      // - In front of rider: ~0.45m forward (z-axis)
      // - Below chest level: ~-0.3m down from camera (y-axis)
      // - Centered: 0 on x-axis
      this.handlebars.position.set(0, -0.3, -0.45);

      // Scale handlebars to realistic BMX size
      // Real BMX handlebars are typically 60-70cm wide
      // Assuming the model is ~1m wide originally, scale to 0.65m (65cm)
      // We need to check the actual model size, but starting with scale that gives ~65cm width
      this.handlebars.scale.set(1.0, 1.0, 1.0);

      // Calculate handlebar rotation when both hands are gripping
      if (this.gripSystem.areBothHandsAttached()) {
        // Get target rotation from grip system
        this.targetHandlebarRotation = this.gripSystem.calculateHandlebarRotation();

        // Apply rotation constraints (±90 degrees)
        this.targetHandlebarRotation = Math.max(
          -this.maxHandlebarRotation,
          Math.min(this.maxHandlebarRotation, this.targetHandlebarRotation)
        );
      } else {
        // Return to neutral position when not gripping
        this.targetHandlebarRotation = 0;
      }

      // Smooth interpolation between current and target rotation
      this.currentHandlebarRotation = THREE.MathUtils.lerp(
        this.currentHandlebarRotation,
        this.targetHandlebarRotation,
        this.handlebarRotationSmoothing
      );

      // Apply rotation to handlebars
      // X rotation: forward tilt for natural riding angle (~9 degrees)
      // Y rotation: steering based on controller positions
      this.handlebars.rotation.x = Math.PI * 0.05;
      this.handlebars.rotation.y = this.currentHandlebarRotation;
    }
  }

  onResize() {
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    this.camera.aspect = winWidth / winHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(winWidth, winHeight);
    this.renderer.render(this.scene, this.camera);
  }
}

new Context();
