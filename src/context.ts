import * as THREE from "three";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module";
import { XrInput } from "./utils/xrInput";
import { Object3D, Object3DEventMap } from "three";

export class Context {
  frame: number = 0;
  cube?: THREE.Mesh;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  stats: Stats;
  xrInput: XrInput;
  elapsedTime: number;
  deltaTime: number;
  clock: THREE.Clock;
  controls: any;
  handlebars?: Object3D<Object3DEventMap>;

  // Camera rig for VR - represents the rider's body position on BMX
  cameraRig: THREE.Group;

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
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 10000);
    this.camera.near = 0.1;
    this.camera.far = 100;

    // Create camera rig for VR - this represents the rider's body position
    this.cameraRig = new THREE.Group();
    this.cameraRig.name = "CameraRig";

    // Position the rig at BMX rider position
    this.cameraRig.position.set(0, 0, 0);

    // Add camera to rig - camera will be at head height relative to rig
    this.cameraRig.add(this.camera);
    this.scene.add(this.cameraRig);

    // For non-VR mode, set camera position for debugging view
    // In VR mode, the headset will control the camera position relative to the rig
    this.camera.position.set(0, Context.RIDER_HEAD_HEIGHT, 2);
    this.camera.lookAt(0, Context.HANDLEBAR_HEIGHT, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, Context.HANDLEBAR_HEIGHT, 0);
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

    // Handle VR session start - adjust camera rig for proper rider perspective
    this.renderer.xr.addEventListener("sessionstart", () => {
      this.onVRSessionStart();
    });

    this.renderer.xr.addEventListener("sessionend", () => {
      this.onVRSessionEnd();
    });

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
      this.handlebars = handlebars
      this.scene.add(handlebars)
    })

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

  onAnimate() {
    this.frame++;
    this.elapsedTime = this.clock.elapsedTime;
    this.deltaTime = this.clock.getDelta();
    this.xrInput.onAnimate();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.stats.update();
    if (this.handlebars) {
      // Position handlebars at proper BMX rider reach
      // In front of rider (negative Z), at handlebar height, centered on X
      this.handlebars.position.set(
        0,
        Context.HANDLEBAR_HEIGHT,
        -Context.HANDLEBAR_DISTANCE
      );
      // Scale to realistic BMX handlebar size (approximately 60-70cm wide)
      // Adjust scale factor based on the original model dimensions
      this.handlebars.scale.set(0.3, 0.3, 0.3);
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

  onVRSessionStart() {
    // When VR session starts, the headset takes over camera position
    // The camera rig should be positioned so the user feels like they're on the BMX
    // The rig position stays at origin, and the headset's real-world position
    // becomes the rider's head position
    console.log("VR Session Started - Configuring rider perspective");

    // Reset camera position relative to rig for VR
    // In VR, the camera position is controlled by the headset
    this.camera.position.set(0, 0, 0);

    // The user should be standing/seated where the rider's head would be
    // Adjust rig to account for floor-level reference space
    // Most VR systems use floor-level, so we position the rig at 0
    // and the user's physical height becomes the head height
    this.cameraRig.position.set(0, 0, 0);
  }

  onVRSessionEnd() {
    // Restore non-VR camera position
    console.log("VR Session Ended - Restoring debug view");
    this.camera.position.set(0, Context.RIDER_HEAD_HEIGHT, 2);
    this.camera.lookAt(0, Context.HANDLEBAR_HEIGHT, 0);
  }
}

new Context();
