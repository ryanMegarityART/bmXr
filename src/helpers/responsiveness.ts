import { WebGLRenderer } from "three";
import * as THREE from "three";

export function resizeRendererToDisplaySize(renderer: WebGLRenderer, camera: THREE.PerspectiveCamera) {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
