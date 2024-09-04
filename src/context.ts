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
    this.camera.position.set(-7, 10, 15);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
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
      const vector = new THREE.Vector3(0, 1, 0)
      this.handlebars.position.set(1, -0.2, 0)
      this.handlebars.scale.set(0.2, 0.2, 0.2)
      // this.handlebars.rotateOnAxis(vector, 0.1)
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
