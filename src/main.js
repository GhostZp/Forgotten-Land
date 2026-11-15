
import * as THREE from 'three';
import './style.css';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 1. Create the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202025);

// 2. Create the camera
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

camera.position.set(0, 2, 5);

// 3. Create the renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

document.body.appendChild(renderer.domElement);

// 4. Add orbit controls
const controls = new OrbitControls(camera, renderer.domElement);

controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 5. Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);


const directionalLight = new THREE.DirectionalLight(0xffffff, 3);

directionalLight.position.set(5, 10, 5);

directionalLight.castShadow = true;

// Increase shadow map resolution
directionalLight.shadow.mapSize.set(2048, 2048);

// Reduce shadow acne
directionalLight.shadow.bias = -0.0001;
directionalLight.shadow.normalBias = 0.02;

// Adjust shadow camera
directionalLight.shadow.camera.near = 0.1;
directionalLight.shadow.camera.far = 50;

directionalLight.shadow.camera.left = -20;
directionalLight.shadow.camera.right = 20;
directionalLight.shadow.camera.top = 20;
directionalLight.shadow.camera.bottom = -20;

scene.add(directionalLight);


// 6. Load your Blender GLB model
const loader = new GLTFLoader();

loader.load(
  `${import.meta.env.BASE_URL}models/forgottenlandmodel.glb`,
  (gltf) => {
    scene.add(gltf.scene);

    // Calculate the model's dimensions
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Center the model at the origin
    model.position.sub(center);

    // Enable shadows
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(model);

    // Automatically position camera based on model size
    const maxDimension = Math.max(size.x, size.y, size.z);

    camera.position.set(
      maxDimension * 1.5,
      maxDimension * 1.2,
      maxDimension * 2.5
    );

    camera.near = Math.max(0.01, maxDimension / 100);
    camera.far = maxDimension * 100;
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update();

    console.log('3D model loaded successfully!');
  },

  (progress) => {
    console.log(
      'Loading:',
      (progress.loaded / progress.total) * 100,
      '%'
    );
  },

  (error) => {
    console.error('Error loading GLB model:', error);
  }
);

// 7. Handle window resizing
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Animation loop
function animate() {
  requestAnimationFrame(animate);

  controls.update();

  renderer.render(scene, camera);
}

animate();
