import * as THREE from "three";
import "./style.css";

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

const base = import.meta.env.BASE_URL;

// 1. Create the scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202025);

// 2. Create the camera
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

camera.position.set(0, 2, 5);

// 3. Create the renderer
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
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

// Load HDR environment map (.exr)
const exrLoader = new EXRLoader();

exrLoader.load(
  `${base}textures/360kuvaAK.exr`,
  (texture) => {
    // Tell Three.js this is a 360-degree equirectangular image
    texture.mapping = THREE.EquirectangularReflectionMapping;

    // Generate environment map for realistic lighting
    const pmremGenerator = new THREE.PMREMGenerator(renderer);

    const envMap = pmremGenerator.fromEquirectangular(texture).texture;

    // Apply HDR to scene
    scene.environment = envMap;

    // Display the original HDR as a 360-degree background
    scene.background = texture;

    // Clean up
    pmremGenerator.dispose();

    console.log("360 HDR environment loaded!");
  },
  undefined,
  (error) => {
    console.error("HDR loading failed:", error);
  },
);

// VR

//////////////
//Initialize variables
//////////////
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let raycaster = new THREE.Raycaster();
const intersected = new Map();
const tempMatrix = new THREE.Matrix4();
let group;
const originalMaterials = new WeakMap();

initVR();

function initVR() {
  document.body.appendChild(VRButton.createButton(renderer));
  renderer.xr.enabled = true;
  // controllers

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener("selectstart", onSelectStart);
  controller1.addEventListener("selectend", onSelectEnd);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener("selectstart", onSelectStart);
  controller2.addEventListener("selectend", onSelectEnd);
  scene.add(controller2);

  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(
    controllerModelFactory.createControllerModel(controllerGrip1),
  );
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  const loader = new GLTFLoader();
  const gunUrl = `${base}models/gundy/scene.gltf`;
  console.log("Loading gun from:", gunUrl);
  loader.load(
    gunUrl,
    // Onnistunut lataus
    (gltf) => {
      const model = gltf.scene;
      model.scale.setScalar(0.0003);
      model.rotation.y = THREE.MathUtils.degToRad(220);
      model.rotation.x = THREE.MathUtils.degToRad(-30);
      model.position.set(0, 0.01, 0);
      controllerGrip2.add(model);
      console.log("Gun loaded successfully!", model);
    },
    // Latauksen edistyminen
    undefined,
    // Virhetilanne
    (error) => {
      console.error("Gun loading failed:", gunUrl, error);
    },
  );
  scene.add(controllerGrip2);

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
  });

  const line1 = new THREE.Line(geometry, material);
  const line2 = new THREE.Line(geometry, material);

  line1.name = "line";
  line2.name = "line";

  line1.scale.z = 5;
  line2.scale.z = 5;

  controller1.add(line1);
  controller2.add(line2);

  raycaster = new THREE.Raycaster();
}


// ==========================================
// GRABBING SYSTEM
// ==========================================

// Get objects intersected by controller ray.
function getIntersections(controller) {

  if (!group) return [];

  controller.updateMatrixWorld(true);

  tempMatrix.identity().extractRotation(controller.matrixWorld);

  raycaster.ray.origin.setFromMatrixPosition(
    controller.matrixWorld
  );

  raycaster.ray.direction.set(0, 0, -1)
    .applyMatrix4(tempMatrix);

  return raycaster.intersectObjects(group.children, true);
}


// Find the actual object inside FLO.glb.
// This allows us to grab an entire object,
// rather than an individual mesh.
function getGrabbableObject(mesh) {

  let object = mesh;

  while (
    object.parent &&
    object.parent !== group
  ) {
    object = object.parent;
  }

  return object;
}


// Change object appearance.
function setObjectColor(object, color) {

  object.traverse((child) => {

    if (!child.isMesh) return;

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.forEach((material) => {

      if (!material.emissive) return;

      // Save original appearance once.
      if (!originalMaterials.has(material)) {

        originalMaterials.set(material, {
          color: material.emissive.clone(),
          intensity: material.emissiveIntensity,
        });

      }

      if (color === null) {

        // Restore original appearance.
        const original = originalMaterials.get(material);

        material.emissive.copy(original.color);
        material.emissiveIntensity = original.intensity;

      } else {

        material.emissive.set(color);
        material.emissiveIntensity = 1;

      }

    });

  });
}


// ==========================================
// GRAB OBJECT
// ==========================================

function onSelectStart(event) {

  const controller = event.target;

  // Don't grab another object while holding one.
  if (controller.userData.selected) return;

  const intersections = getIntersections(controller);

  if (intersections.length === 0) return;

  const object = getGrabbableObject(
    intersections[0].object
  );

  // Don't grab an object already held by another controller.
  if (object.userData.isGrabbed) return;

  // Mark as grabbed.
  object.userData.isGrabbed = true;

  // Turn blue.
  setObjectColor(object, 0x0000ff);

  // Attach the complete object to the controller.
  controller.attach(object);

  controller.userData.selected = object;

  // Remove its previous hover state.
  intersected.delete(controller);

  console.log("Object grabbed:", object);
}


// ==========================================
// RELEASE OBJECT
// ==========================================

function onSelectEnd(event) {

  const controller = event.target;

  const object = controller.userData.selected;

  if (!object) return;

  // Return object to FLO group.
  // World position and rotation are preserved.
  group.attach(object);

  object.userData.isGrabbed = false;

  // Restore original appearance.
  setObjectColor(object, null);

  controller.userData.selected = undefined;

  console.log("Object released:", object);
}


// ==========================================
// HIGHLIGHT OBJECTS
// ==========================================

function intersectObjects(controller) {

  if (!controller) return;

  const line = controller.getObjectByName("line");

  // Don't highlight while holding an object.
  if (controller.userData.selected) {

    if (line) line.scale.z = 5;

    return;
  }

  // Get intersections.
  const intersections = getIntersections(controller);

  let object = null;

  if (intersections.length > 0) {

    object = getGrabbableObject(
      intersections[0].object
    );

    // Don't highlight objects held by another controller.
    if (object.userData.isGrabbed) {
      object = null;
    }

  }

  // Get previously highlighted object.
  const previous = intersected.get(controller);

  // Restore previous object if pointing elsewhere.
  if (previous && previous !== object) {

    setObjectColor(previous, null);

    intersected.delete(controller);

  }

  // Highlight new object in red.
  if (object) {

    setObjectColor(object, 0xff0000);

    intersected.set(controller, object);

    if (line) {
      line.scale.z = intersections[0].distance;
    }

  } else {

    if (line) line.scale.z = 5;

  }

}


// ==========================================
// UPDATE HIGHLIGHTS
// ==========================================

function cleanIntersected() {

  intersectObjects(controller1);

  intersectObjects(controller2);

}


// 5. Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

// 6. Load your Blender GLB model
const loader = new GLTFLoader();

loader.load(
  `${import.meta.env.BASE_URL}models/FLB.glb`,
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
      maxDimension * 2.5,
    );

    camera.near = Math.max(0.01, maxDimension / 100);
    camera.far = maxDimension * 100;
    camera.updateProjectionMatrix();

    controls.target.set(0, 0, 0);
    controls.update();

    console.log("3D model loaded successfully!");
  },

  (progress) => {
    console.log("Loading:", (progress.loaded / progress.total) * 100, "%");
  },

  (error) => {
    console.error("Error loading GLB model:", error);
  },
);

// ==========================================
// Load grabbable objects (FLO.glb)
// ==========================================

const floLoader = new GLTFLoader();

floLoader.load(
  `${base}models/FLO.glb`,

  (gltf) => {

  const floModel = gltf.scene;

  // Enable shadows and prepare materials.
  floModel.traverse((child) => {

    if (child.isMesh) {

      child.castShadow = true;
      child.receiveShadow = true;

      // Clone materials so highlighting one object
      // doesn't unintentionally change other objects.
      if (Array.isArray(child.material)) {

        child.material = child.material.map(
          material => material.clone()
        );

      } else {

        child.material = child.material.clone();

      }

    }

  });

  // Set FLO as the grabbable object group.
  group = floModel;

  // Add FLO to the scene.
  scene.add(floModel);

  console.log("FLO model loaded successfully!", floModel);

},

  (progress) => {
    console.log("Loading FLO:", (progress.loaded / progress.total) * 100, "%");
  },

  (error) => {
    console.error("Error loading FLO model:", error);
  },
);

// 7. Handle window resizing
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Animation loop
renderer.setAnimationLoop(function () {

  // Update object highlighting.
  if (renderer.xr.isPresenting) {
    cleanIntersected();
  }

  renderer.render(scene, camera);

});
