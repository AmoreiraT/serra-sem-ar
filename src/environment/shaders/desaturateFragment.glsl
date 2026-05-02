vec3 applyUrbanDesaturation(vec3 inputColor, float amount, float brightnessFactor) {
  float luma = dot(inputColor, vec3(0.299, 0.587, 0.114));
  vec3 grayscale = vec3(luma);
  vec3 mixed = mix(inputColor, grayscale, clamp(amount, 0.0, 1.0));
  return mixed * brightnessFactor;
}
