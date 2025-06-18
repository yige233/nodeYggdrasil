import fs from "node:fs/promises";
import { PNG } from "pngjs";
import Utils, { ErrorResponse } from "./utils.js";
import { model, PublicProfileData, TextureData, TexturesData } from "./interfaces.js";
import { cacheMgr, CONFIG, pathOf, pinoLogger, TEXTURES } from "../global.js";
import Profile from "./profile.js";

function readPNGMeta(imageData: Buffer): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.on("error", (err) => {
      png.destroy();
      reject(err);
    });
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

export default function textureManager(profile: Profile) {
  function setTexture(type: "skin" | "cape"): ((url: string, model?: "default" | "slim") => Promise<void>) | ((url: string) => Promise<void>) {
    const applyToProfile = async (textureType: "skin" | "cape", textureData: TextureData) => {
      await removeTexture(textureType);
      profile.textures[textureType.toUpperCase()] = textureData;
    };
    if (type === "skin") {
      return (url: string, model: "default" | "slim" = "default") => applyToProfile("skin", { url, metadata: { model } });
    }
    if (type === "cape") {
      return (url: string) => applyToProfile("cape", { url });
    }
  }
  async function removeTexture(textureType: "skin" | "cape") {
    // 从材质目录中移除相关数据
    const hash = profile.localRes[textureType];
    // 从角色的皮肤胡数据中移除相关数据
    delete profile.textures[textureType.toUpperCase()];
    delete profile.localRes[textureType];
    // 目录中不存在该材质
    if (!TEXTURES[hash]) return;
    // 从使用该材质的角色列表中移除当前角色
    const profileIdIndex = TEXTURES[hash].findIndex((i: string) => i === profile.id);
    TEXTURES[hash].splice(profileIdIndex, 1);
    // 使用该材质的角色列表长度为0，说明该材质已经无人使用了
    if (TEXTURES[hash].length === 0) {
      delete TEXTURES[hash];
      await fs.unlink(pathOf(`textures/${hash}.png`)).catch((e) => pinoLogger.error(e));
    }
  }
  return {
    deleteTexture(textureType: "skin" | "cape" | "all") {
      // 删除所有材质
      if (textureType === "all") {
        return Promise.allSettled(["skin", "cape"].map(removeTexture));
      }
      // 删除指定的材质
      return removeTexture(textureType);
    },
    setModel(model: "slim" | "default") {
      if (!profile.textures.SKIN) {
        throw new ErrorResponse("BadOperation", "该角色没有皮肤，无法修改其模型。");
      }
      profile.textures.SKIN.metadata = { model };
    },
    async copyFromOfficial(profileName: string) {
      const { id, errorMessage }: { id: string; errorMessage: string } = await Utils.fetch(`https://api.mojang.com/users/profiles/minecraft/${profileName}`, { fallback: {}, cacheMgr });
      if (errorMessage) {
        throw new ErrorResponse("BadOperation", `Mojang 服务器返回了如下的错误信息: ${errorMessage}`);
      }
      if (!id) {
        throw new ErrorResponse("BadOperation", `服务器暂时无法连接到 Mojang API 。(1/2)`);
      }
      const {
        properties: [{ value }],
      }: Partial<PublicProfileData> = await Utils.fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { fallback: { properties: [] }, cacheMgr });
      if (!value) {
        throw new ErrorResponse("BadOperation", "服务器暂时无法连接到 Mojang API 。(2/2)");
      }
      const {
        textures: { SKIN, CAPE },
      }: Partial<TexturesData> = JSON.parse(Utils.decodeb64(value));
      if (!SKIN && !CAPE) {
        throw new ErrorResponse("BadOperation", `该角色没有皮肤或披风: ${profileName}.`);
      }
      if (SKIN) {
        await setTexture("skin")(SKIN.url, SKIN.metadata?.model);
      }
      if (CAPE) {
        await setTexture("cape")(CAPE.url);
      }
    },
    async importFromLittleskin(littleskinTid: string) {
      const { hash, type: textureType } = await Utils.fetch(`https://littleskin.cn/texture/${littleskinTid}`, { fallback: {}, cacheMgr });
      if (!hash) {
        throw new ErrorResponse("BadOperation", `提供的皮肤ID无效: ${littleskinTid} ，或者是服务器暂时无法连接到 LittleSkin 。`);
      }
      const textureURL = `https://littleskin.cn/textures/${hash}`;
      if (textureType != "cape") {
        return setTexture("skin")(textureURL, textureType === "steve" ? "default" : "slim");
      }
      return setTexture("cape")(textureURL);
    },
    async importFromOfficialURL(hash: string, textureType: model | "cape") {
      const matchedHash = hash.match(/[0-9a-f]{64}/i)?.[0] ?? null;
      if (!matchedHash) {
        throw new ErrorResponse("BadOperation", "提供的皮肤哈希字符串无效。");
      }
      const textureURL = `http://textures.minecraft.net/texture/${matchedHash}`;
      const officialResponse = await Utils.fetch(textureURL, { fallback: false, cacheMgr });
      if (!officialResponse) {
        throw new ErrorResponse("BadOperation", `提供的Mojang皮肤哈希无效: ${matchedHash} ，或者是服务器暂时无法连接到Mojang。`);
      }
      if (textureType != "cape") {
        return setTexture("skin")(textureURL, textureType);
      }
      return setTexture("cape")(textureURL);
    },
    async uploadTexture(file: Buffer, textureModel: model | "cape") {
      const sha256 = Utils.sha256(file);
      const isSkin = textureModel != "cape";
      const textureType = isSkin ? "skin" : "cape";
      const textureURL = `${CONFIG.server.root}yggdrasil/textures/${sha256}`;
      if (isSkin) {
        await setTexture("skin")(textureURL, textureModel === "default" ? "default" : "slim");
      } else {
        await setTexture("cape")(textureURL);
      }
      profile.capeVisible = true;
      profile.localRes[textureType] = sha256;
      // 该材质已经存在，直接向它的列表中添加角色就行
      if (TEXTURES[sha256]) {
        TEXTURES[sha256].push(profile.id);
        return;
      }
      // 该材质不存在，为其创建角色列表，并保存该材质
      TEXTURES[sha256] = [profile.id];
      await fs.writeFile(pathOf(`textures/${sha256}.png`), file).catch((e) => pinoLogger.error(e));
    },
  };
}
/**
 * 对上传的材质文件进行处理
 * @param imageData 图片buffer数据
 * @param type 材质类型
 * @returns {Buffer}
 */
export async function checkTexture(imageData: Buffer, type: "skin" | "cape"): Promise<Buffer> {
  async function checkImageSize() {
    const { width, height } = await readPNGMeta(imageData);
    const is64x32 = Number.isInteger(width / 64) && Number.isInteger(height / 32),
      is64x64 = Number.isInteger(width / 64) && Number.isInteger(height / 64),
      is22x17 = Number.isInteger(width / 22) && Number.isInteger(height / 17);
    // 尺寸不是64x32、64x64或22x17，或者尺寸是22x17，但不是披风
    if ((type != "cape" && is22x17) || (!is64x32 && !is64x64 && !is22x17)) {
      throw new ErrorResponse("UnprocessableEntity", `提供的图像的宽度或高度无效。当前图像的宽度: ${width}；高度: ${height}`);
    }
    // 尺寸是22x17的披风，补足像素
    if (is22x17) {
      const multiplier = Math.ceil(width / 64);
      return { width: 64 * multiplier, height: 32 * multiplier };
    }
    return { width, height };
  }
  // 未开启材质上传
  if (!CONFIG.user.uploadTexture) {
    throw new ErrorResponse("ForbiddenOperation", "服务器已禁用在线上传材质。");
  }
  const { width, height } = await checkImageSize();
  const image = await readPNG(imageData);
  const newImage = new PNG({ width, height, colorType: 6, inputHasAlpha: true });
  image.bitblt(newImage, 0, 0, image.width, image.height);
  return PNG.sync.write(newImage, { colorType: 6 });
}
