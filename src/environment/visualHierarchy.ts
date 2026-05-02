import * as THREE from 'three';
import desaturateFragment from './shaders/desaturateFragment.glsl?raw';

export const applyBackgroundMaterialConstraints = (material: THREE.MeshStandardMaterial): void => {
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.opacity = Math.min(material.opacity, 0.92);
  material.toneMapped = false;
  material.fog = false;
  material.emissive.setRGB(0.28, 0.28, 0.28);
  material.emissiveIntensity = 0.9;
};

export const applyDesaturationShader = (
  material: THREE.MeshStandardMaterial,
  desaturationAmount: number,
  contrast: number,
  brightness: number
): void => {
  const clampedDesaturation = Math.min(1, Math.max(0, desaturationAmount));
  const clampedContrast = Math.min(1, Math.max(0.6, contrast));
  const clampedBrightness = Math.min(1.25, Math.max(0.72, brightness));

  material.onBeforeCompile = (shader: THREE.Shader) => {
    shader.uniforms.uDesaturationAmount = { value: clampedDesaturation };
    shader.uniforms.uContrastAmount = { value: clampedContrast };
    shader.uniforms.uBrightnessAmount = { value: clampedBrightness };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uDesaturationAmount;
uniform float uContrastAmount;
uniform float uBrightnessAmount;
${desaturateFragment}`
      )
      .replace(
        '#include <dithering_fragment>',
        `gl_FragColor.rgb = applyUrbanDesaturation(gl_FragColor.rgb, uDesaturationAmount, uBrightnessAmount);
gl_FragColor.rgb = ((gl_FragColor.rgb - 0.5) * uContrastAmount) + 0.5;
#include <dithering_fragment>`
      );
  };

  material.customProgramCacheKey = () =>
    `urban_void_${clampedDesaturation.toFixed(3)}_${clampedContrast.toFixed(3)}_${clampedBrightness.toFixed(3)}`;

  material.needsUpdate = true;
};
