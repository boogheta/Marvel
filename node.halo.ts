// Forked from @Yomguithereal's sigma-experiments programs: https://github.com/Yomguithereal/sigma-experiments/blob/master/renderers/src/node/node.halo.ts

// A node renderer using one triangle to render a blurry halo useful to render
// a basic heatmap with variable color, size and intensity
// NOTE: the ignoreZoom uniform is not in use but could be accessed through
// a factory.

import type { NodeDisplayData, RenderParams } from "sigma/types";
import { NodeProgram } from "sigma/rendering/webgl/programs/common/node";
import NodeCircleProgram from "sigma/rendering/webgl/programs/node.circle";
import { floatColor } from "sigma/utils";

interface NodeDisplayDataWithHalo extends NodeDisplayData {
  haloColor?: string;
  haloIntensity?: number;
  haloSize?: number;
}

const VERTEX_SHADER_SOURCE = /*glsl*/ `
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;
attribute vec4 a_color;
attribute float a_intensity;
uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;
uniform float u_ignoreZoom;
varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;
varying float v_intensity;
const float bias = 255.0 / 254.0;
const float marginRatio = 1.05;
void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * u_ignoreZoom * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector * marginRatio;
  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );
  v_border = u_correctionRatio;
  v_diffVector = diffVector;
  v_radius = size / 2.0 / marginRatio;
  v_color = a_color;
  v_color.a *= bias;
  v_intensity = a_intensity;
}
`;

const FRAGMENT_SHADER_SOURCE = /*glsl*/ `
precision highp float;
varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_border;
varying float v_intensity;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);
void main(void) {
  float dist = length(v_diffVector);
  float intensity = v_intensity * (v_radius - dist) / v_radius;
  if (dist < v_radius) {
    gl_FragColor = vec4(v_color * intensity);
  }
  else {
    gl_FragColor = transparent;
  }
}
`;

const UNIFORMS = ["u_sizeRatio", "u_correctionRatio", "u_matrix", "u_ignoreZoom"] as const;

const { FLOAT, UNSIGNED_BYTE } = WebGLRenderingContext;

export default class NodeHaloProgram extends NodeProgram<typeof UNIFORMS[number]> {
  getDefinition() {
    return {
      VERTICES: 3,
      ARRAY_ITEMS_PER_VERTEX: 6,
      VERTEX_SHADER_SOURCE,
      FRAGMENT_SHADER_SOURCE,
      UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: FLOAT },
        { name: "a_size", size: 1, type: FLOAT },
        { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: "a_angle", size: 1, type: FLOAT },
        { name: "a_intensity", size: 1, type: FLOAT },
      ],
    };
  }

  processVisibleItem(i: number, data: NodeDisplayDataWithHalo) {
    const array = this.array;

    const color = floatColor(data.haloColor || data.color);
    const intensity = typeof data.haloIntensity === "number" ? data.haloIntensity : 1;
    const size = Math.max(typeof data.haloSize === "number" ? data.haloSize : 0, data.size);

    array[i++] = data.x;
    array[i++] = data.y;
    array[i++] = size;
    array[i++] = color;
    array[i++] = NodeCircleProgram.ANGLE_1;
    array[i++] = intensity;

    array[i++] = data.x;
    array[i++] = data.y;
    array[i++] = size;
    array[i++] = color;
    array[i++] = NodeCircleProgram.ANGLE_2;
    array[i++] = intensity;

    array[i++] = data.x;
    array[i++] = data.y;
    array[i++] = size;
    array[i++] = color;
    array[i++] = NodeCircleProgram.ANGLE_3;
    array[i++] = intensity;
  }

  draw(params: RenderParams): void {
    const gl = this.gl;

    const { u_sizeRatio, u_correctionRatio, u_matrix, u_ignoreZoom } = this.uniformLocations;

    gl.uniform1f(u_ignoreZoom, 1);
    // NOTE: uncomment next line to disable zoom impact.
    // gl.uniform1f(u_ignoreZoom, 1 / params.sizeRatio);
    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniform1f(u_correctionRatio, params.correctionRatio);
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);

    gl.drawArrays(gl.TRIANGLES, 0, this.verticesCount);
  }
}
