import fs from "node:fs/promises";
import Utils, { CONFIG, ErrorResponse, TEXTURES } from "./utils.js";
import { uuid } from "./interfaces.js";
import { PNG } from "pngjs";

function readPNGMeta(imageData: Buffer): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.on("error", (err) => reject(err));
    png.on("metadata", (metadata) => {
      resolve({ width: metadata.width, height: metadata.height });
      png.destroy();
    });
    png.parse(imageData);
  });
}
function readPNG(imageData: Buffer): Promise<PNG> {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.on("error", (err) => reject(err));
    png.on("parsed", () => {
      resolve(png);
    });
    png.parse(imageData);
  });
}

/** 材质管理 */
export default class Textures {
  /**
   * 从给定的材质id中删除其对应的角色id
   * @param textureHash 给定的材质id
   * @param profileId 角色id
   */
  static async remove(textureHash: uuid, profileId: uuid) {
    if (!TEXTURES.content[textureHash]) {
      //目录中不存在该材质
      return undefined;
    }
    TEXTURES.content[textureHash].splice(
      TEXTURES.content[textureHash].findIndex((i) => i == profileId),
      1
    );
    if (TEXTURES.content[textureHash].length == 0) {
      //该材质对应的角色列表长度为0，说明该材质已经无人使用了
      delete TEXTURES.content[textureHash];
      await fs.unlink(`./data/textures/${textureHash}.png`).catch(() => undefined);
    }
    await TEXTURES.save();
  }
  /**
   * 添加一个材质，并向它的角色列表中添加角色id
   * @param textureHash 材质Buffer
   * @param profileId 角色id
   */
  static async add(texture: Buffer, profileId: uuid, sha256?: string) {
    const hash = sha256 ?? Utils.sha256(texture);
    if (TEXTURES.content[hash]) {
      //该材质已经存在，直接向它的列表中添加角色就行
      TEXTURES.content[hash].push(profileId);
    } else {
      //该材质不存在，为其创建角色列表，并保存该材质
      TEXTURES.content[hash] = [profileId];
      await fs.writeFile(`./data/textures/${hash}.png`, texture);
    }
    await TEXTURES.save();
  }
  /**
   * 对上传的材质文件进行处理
   * @param imageData 图片buffer数据
   * @returns {Buffer}
   */
  static async check(imageData: Buffer, type: string): Promise<Buffer> {
    if (CONFIG.content.user.disableUploadTexture) {
      throw new ErrorResponse("ForbiddenOperation", "The server has disabled uploading textures online.");
    }
    try {
      let { width, height } = await readPNGMeta(imageData);
      const image = await readPNG(imageData);
      const size64x32 = Number.isInteger(width / 64) && Number.isInteger(height / 32),
        size64x64 = Number.isInteger(width / 64) && Number.isInteger(height / 64),
        size22x17 = Number.isInteger(width / 22) && Number.isInteger(height / 17);
      if ((type != "cape" && size22x17) || (!size64x32 && !size64x64 && !size22x17)) {
        throw new ErrorResponse("UnprocessableEntity", `Incorrect image width or height. Received width: ${width}; height: ${height}`);
      }
      //尺寸符合
      if (size22x17) {
        //尺寸是22x17的披风，补足像素
        const multiplier = Math.ceil(width / 64);
        height = 32 * multiplier;
        width = 64 * multiplier;
      }
      const newImage = new PNG({
        width,
        height,
        colorType: 6,
        inputHasAlpha: true,
      });
      image.bitblt(newImage, 0, 0, image.width, image.height);
      return PNG.sync.write(newImage, { colorType: 6 });
    } catch (err) {
      throw new ErrorResponse("UnprocessableEntity", `Received data can't be processed.`);
    }
  }
}
