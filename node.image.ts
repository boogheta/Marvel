/**
 * Sigma.js WebGL Renderer Node Program
 * =====================================
 *
 * Program rendering nodes using GL_POINTS, but that draws an image on top of
 * the classic colored disc.
 * @module
 */
import Sigma from "sigma";
import { Coordinates, Dimensions, NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";
import VERTEX_SHADER_SOURCE from "sigma/rendering/webgl/shaders/node.image.vert.glsl";
import FRAGMENT_SHADER_SOURCE from "sigma/rendering/webgl/shaders/node.image.frag.glsl";
import { NodeProgram, NodeProgramConstructor } from "sigma/rendering/webgl/programs/common/node";

interface NodeDisplayDataWithBorder extends NodeDisplayData {
  borderColor?: string;
  borderRatio?: number;
  borderSize?: number;
}

// maximum size of single texture in atlas
const MAX_TEXTURE_SIZE = 192;
// maximum width of atlas texture (limited by browser)
// low setting of 3072 works on phones & tablets
const MAX_CANVAS_WIDTH = 3072;

type ImageLoading = { status: "loading" };
type ImageError = { status: "error" };
type ImagePending = { status: "pending"; image: HTMLImageElement };
type ImageReady = { status: "ready" } & Coordinates & Dimensions;
type ImageType = ImageLoading | ImageError | ImagePending | ImageReady;

/**
 * To share the texture between the program instances of the graph and the
 * hovered nodes (to prevent some flickering, mostly), this program must be
 * "built" for each sigma instance:
 */
export default function getNodeImageProgram(): NodeProgramConstructor {
  /**
   * These attributes are shared between all instances of this exact class,
   * returned by this call to getNodeProgramImage:
   */
  const rebindTextureFns: (() => void)[] = [];
  const images: Record<string, ImageType> = {};
  let textureImage: ImageData;
  let hasReceivedImages = false;
  let pendingImagesFrameID: number | undefined = undefined;

  // next write position in texture
  let writePositionX = 0;
  let writePositionY = 0;
  // height of current row
  let writeRowHeight = 0;

  interface PendingImage {
    image: HTMLImageElement;
    id: string;
    size: number;
  }

  /**
   * Helper to load an image:
   */
  function loadImage(imageSource: string): void {
    if (images[imageSource]) return;

    const image = new Image();
    image.addEventListener("load", () => {
      images[imageSource] = {
        status: "pending",
        image,
      };

      if (typeof pendingImagesFrameID !== "number") {
        pendingImagesFrameID = requestAnimationFrame(() => finalizePendingImages());
      }
    });
    image.addEventListener("error", () => {
      images[imageSource] = { status: "error" };
    });
    images[imageSource] = { status: "loading" };

    // Load image:
    image.setAttribute("crossOrigin", "");
    image.src = imageSource;
  }

  /**
   * Helper that takes all pending images and adds them into the texture:
   */
  function finalizePendingImages(): void {
    pendingImagesFrameID = undefined;

    const pendingImages: PendingImage[] = [];

    // List all pending images:
    for (const id in images) {
      const state = images[id];
      if (state.status === "pending") {
        pendingImages.push({
          id,
          image: state.image,
          size: Math.min(state.image.width, state.image.height) || 1,
        });
      }
    }

    // Add images to texture:
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;

    // limit canvas size to avoid browser and platform limits
    let totalWidth = hasReceivedImages ? textureImage.width : 0;
    let totalHeight = hasReceivedImages ? textureImage.height : 0;

    // initialize image drawing offsets with current write position
    let xOffset = writePositionX;
    let yOffset = writePositionY;

    /**
     * Draws a (full or partial) row of images into the atlas texture
     * @param pendingImages
     */
    const drawRow = (pendingImages: PendingImage[]) => {
      // update canvas size before drawing
      if (canvas.width !== totalWidth || canvas.height !== totalHeight) {
        canvas.width = Math.min(MAX_CANVAS_WIDTH, totalWidth);
        canvas.height = totalHeight;

        // draw previous texture into resized canvas
        if (hasReceivedImages) {
          ctx.putImageData(textureImage, 0, 0);
        }
      }

      pendingImages.forEach(({ id, image, size }) => {
        const imageSizeInTexture = Math.min(MAX_TEXTURE_SIZE, size);

        // Crop image, to only keep the biggest square, centered:
        let dx = 0,
          dy = 0;
        if ((image.width || 0) > (image.height || 0)) {
          dx = (image.width - image.height) / 2;
        } else {
          dy = (image.height - image.width) / 2;
        }
        ctx.drawImage(image, dx, dy, size, size, xOffset, yOffset, imageSizeInTexture, imageSizeInTexture);

        // Update image state:
        images[id] = {
          status: "ready",
          x: xOffset,
          y: yOffset,
          width: imageSizeInTexture,
          height: imageSizeInTexture,
        };

        xOffset += imageSizeInTexture;
      });

      hasReceivedImages = true;
      textureImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    };

    let rowImages: PendingImage[] = [];
    pendingImages.forEach((image) => {
      const { size } = image;
      const imageSizeInTexture = Math.min(size, MAX_TEXTURE_SIZE);

      if (writePositionX + imageSizeInTexture > MAX_CANVAS_WIDTH) {
        // existing row is full: flush row and continue on next line
        if (rowImages.length > 0) {
          totalWidth = Math.max(writePositionX, totalWidth);
          totalHeight = Math.max(writePositionY + writeRowHeight, totalHeight);
          drawRow(rowImages);

          rowImages = [];
          writeRowHeight = 0;
        }

        writePositionX = 0;
        writePositionY = totalHeight;
        xOffset = 0;
        yOffset = totalHeight;
      }

      // add image to row
      rowImages.push(image);

      // advance write position and update maximum row height
      writePositionX += imageSizeInTexture;
      writeRowHeight = Math.max(writeRowHeight, imageSizeInTexture);
    });

    // flush pending images in row - keep write position (and drawing cursor)
    totalWidth = Math.max(writePositionX, totalWidth);
    totalHeight = Math.max(writePositionY + writeRowHeight, totalHeight);
    drawRow(rowImages);
    rowImages = [];

    rebindTextureFns.forEach((fn) => fn());
  }

  const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;

  const UNIFORMS = ["u_sizeRatio", "u_pixelRatio", "u_matrix", "u_atlas"] as const;

  return class NodeImageProgram extends NodeProgram<typeof UNIFORMS[number]> {
    getDefinition() {
      return {
        VERTICES: 1,
        ARRAY_ITEMS_PER_VERTEX: 8,
        VERTEX_SHADER_SOURCE,
        FRAGMENT_SHADER_SOURCE,
        UNIFORMS,
        ATTRIBUTES: [
          { name: "a_position", size: 2, type: FLOAT },
          { name: "a_size", size: 1, type: FLOAT },
          { name: "a_color", size: 4, type: UNSIGNED_BYTE, normalized: true },
          { name: "a_texture", size: 4, type: FLOAT },
        ],
      };
    }

    texture: WebGLTexture;
    latestRenderParams?: RenderParams;

    constructor(gl: WebGLRenderingContext, renderer: Sigma) {
      super(gl, renderer);

      rebindTextureFns.push(() => {
        if (this && this.rebindTexture) this.rebindTexture();
        if (renderer && renderer.refresh) renderer.refresh();
      });

      textureImage = new ImageData(1, 1);

      this.texture = gl.createTexture() as WebGLTexture;
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    }

    rebindTexture() {
      const gl = this.gl;

      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureImage);
      gl.generateMipmap(gl.TEXTURE_2D);

      if (this.latestRenderParams) this.render(this.latestRenderParams);
    }

    processVisibleItem(i: number, data: NodeDisplayDataWithBorder & { image?: string }): void {
      const array = this.array;

      const imageSource = data.image;
      const imageState = imageSource && images[imageSource];
      if (typeof imageSource === "string" && !imageState) loadImage(imageSource);

      array[i++] = data.x;
      array[i++] = data.y;
      array[i++] = data.borderRatio
        ? (1 - data.borderRatio) * data.size
        : data.borderSize
          ? data.size - data.borderSize
          : data.size;
      array[i++] = floatColor(data.color);

      // Reference texture:
      if (imageState && imageState.status === "ready") {
        const { width, height } = textureImage;
        array[i++] = imageState.x / width;
        array[i++] = imageState.y / height;
        array[i++] = imageState.width / width;
        array[i++] = imageState.height / height;
      } else {
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
        array[i++] = 0;
      }
    }

    draw(params: RenderParams): void {
      this.latestRenderParams = params;

      const gl = this.gl;

      const { u_sizeRatio, u_pixelRatio, u_matrix, u_atlas } = this.uniformLocations;

      gl.uniform1f(u_sizeRatio, params.sizeRatio);
      gl.uniform1f(u_pixelRatio, params.pixelRatio);
      gl.uniformMatrix3fv(u_matrix, false, params.matrix);
      gl.uniform1i(u_atlas, 0);

      gl.drawArrays(gl.POINTS, 0, this.verticesCount);
    }
  };
}
