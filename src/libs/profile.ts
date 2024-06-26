import { ProfileData, PublicProfileData, TextureData, TexturesData, model, uploadableTextures, uuid } from "./interfaces.js";
import Utils, { ErrorResponse, JSONFile } from "./utils.js";
import Textures from "./textures.js";
import { CONFIG, PRIVATEKEY, PROFILEMAP, PROFILES, USERSMAP } from "../global.js";

/** 角色 */
export default class Profile implements ProfileData {
  readonly id: uuid;
  name: string;
  owner: uuid;
  uploadableTextures: uploadableTextures;
  capeVisible: boolean;
  textures: {
    SKIN?: TextureData;
    CAPE?: TextureData;
  };
  localRes: {
    skin?: string;
    cape?: string;
  };
  constructor(data: ProfileData) {
    this.name = data.name;
    this.id = data.id;
    this.textures = data.textures;
    this.capeVisible = data.capeVisible;
    this.uploadableTextures = data.uploadableTextures;
    this.owner = data.owner || null;
    this.localRes = data.localRes;
  }
  /**
   * 新创建一个角色
   * @param name 角色名称
   * @param userId 要绑定的用户id
   * @param offlineCompatible (默认:true) 是否兼容离线模式（使用与离线模式相同的uuid生成模式）
   * @returns {Profile}
   */
  static async new(name: string, userId: uuid, offlineCompatible: boolean = true): Promise<Profile> {
    if (!USERSMAP.has(userId)) {
      //指定的用户不存在
      throw new ErrorResponse("BadOperation", `Invalid userId: ${userId}`);
    }
    const user = USERSMAP.get(userId);
    user.checkReadonly();
    if (user.profiles.length > CONFIG.user.maxProfileCount) {
      //用户所拥有的角色太多
      throw new ErrorResponse("ForbiddenOperation", "The user have too much profile.");
    }
    Profile.nameCheck(name);
    let id: uuid = offlineCompatible ? Utils.uuid(name) : Utils.uuid();
    if (PROFILEMAP.has(id)) {
      //该角色名称对应的离线uuid已经被他人占用，请尝试换一个名称或取消勾选兼容离线模式
      throw new ErrorResponse("ForbiddenOperation", "The offline uuid corresponding to the profileName has been occupied, please try to change the name or uncheck the compatible offline mode.");
    }
    const profile = new Profile({
      name,
      id,
      textures: {},
      capeVisible: true,
      uploadableTextures: "skin,cape",
      owner: user.id,
      localRes: {},
    });
    user.profiles.push(profile.id);
    await user.save();
    await profile.save();
    return profile;
  }
  /**
   * 检查角色名称是否合法
   * @param name 待检查的角色名称
   * @returns {true}
   */
  static nameCheck(name: string): true {
    if (!name) {
      //没有提供角色名
      throw new ErrorResponse("BadOperation", "The provided profile name is empty.");
    }
    if (name.length >= 30) {
      //该角色名称太长
      throw new ErrorResponse("BadOperation", `The provided profile name is too loooooong.`);
    }
    if (!/^[_A-Za-z0-9\u4e00-\u9fa5]+$/.test(name)) {
      //该角色名称含有非数字、字母、汉字的字符
      throw new ErrorResponse("BadOperation", "The profile name contains illegal characters.");
    }
    if (PROFILEMAP.has(name)) {
      //该角色名称已被使用
      throw new ErrorResponse("ForbiddenOperation", `The provided profile name is already taken: ${name}`);
    }
    return true;
  }
  /**
   * 删除角色
   * @param profileIds 角色id数组
   */
  static async deleteProfile(...profileIds: uuid[]) {
    for (let profileId of profileIds) {
      const profile = PROFILEMAP.get(profileId);
      if (profile.owner && USERSMAP.has(profile.owner)) {
        //如果该角色有所有者，从该所有者中删除该角色
        const owner = USERSMAP.get(profile.owner);
        owner.profiles.splice(
          owner.profiles.findIndex((i) => i == profileId),
          1
        );
        await owner.save();
      }
      await profile.setTexture("delete", { type: "all" });
      delete PROFILES[profileId];
      PROFILEMAP.delete(profileId);
    }
    await JSONFile.save(PROFILES);
  }
  /**
   * 设置角色绑定的材质
   * @param type 进行何种操作。
   * @param data 操作需要的数据。
   * @returns {Promise<Profile>}
   */
  async setTexture(
    /** mojang: 从正版用户获取皮肤和披风; littleskin: 从littleskin的皮肤库获取皮肤; upload: 上传皮肤; delete: 删除皮肤 */
    type: "mojang" | "littleskin" | "upload" | "capeVisible" | "delete",
    data: {
      /** 正版用户id */
      profileName?: string;
      /** littleskin的皮肤id */
      littleskinTid?: string;
      /** 指定删除披风还是皮肤还是两者 */
      type?: "skin" | "cape" | "all";
      /** 上传皮肤 */
      upload?: {
        /** 上传的材质的类别(默认、细手臂、披风) */
        type?: model | "cape";
        /** 材质文件 */
        file: Buffer;
      };
      /** 切换披风可见性 */
      capeVisible?: boolean;
    }
  ): Promise<Profile> {
    USERSMAP.get(this.owner).checkReadonly();
    if (type == "delete") {
      const textureType = ["skin", "cape", "all"].includes(data.type) ? data.type : "all";
      if (textureType == "all") {
        //删除所有材质
        this.textures = {};
        this.localRes = {};
        await Textures.remove(this.localRes.skin, this.id);
        await Textures.remove(this.localRes.cape, this.id);
      } else {
        //删除指定的材质
        delete this.textures[textureType.toUpperCase()];
        if (this.localRes[textureType]) {
          await Textures.remove(this.localRes[textureType], this.id);
          delete this.localRes[textureType];
        }
      }
    }
    if (type == "mojang") {
      const profileName = data.profileName;
      const { id = undefined, errorMessage = undefined }: any = await fetch(`https://api.mojang.com/users/profiles/minecraft/${profileName}`, { headers: Utils.requestHeaders })
        .then((res) => res.json())
        .catch(() => {});
      if (!id) {
        if (errorMessage) {
          throw new ErrorResponse("BadOperation", `Error message from Mojang: ${errorMessage}`);
        }
        throw new ErrorResponse("BadOperation", `The server is temporarily unable to connect to the Mojang API.`);
      }
      const {
        properties: [{ value }],
      }: Partial<PublicProfileData> = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { headers: Utils.requestHeaders })
        .then((res) => res.json())
        .catch(() => ({ properties: [] }));
      if (!value) {
        throw new ErrorResponse("BadOperation", "The server is temporarily unable to connect to the Mojang API, Please try again later.");
      }
      const {
        textures: { SKIN, CAPE },
      }: Partial<TexturesData> = JSON.parse(Utils.decodeb64(value));
      if (!SKIN && !CAPE) {
        throw new ErrorResponse("BadOperation", `This profile name has no skin or cape: ${profileName}.`);
      }
      if (SKIN) {
        await Textures.remove(this.localRes.skin, this.id);
      }
      if (CAPE) {
        await Textures.remove(this.localRes.cape, this.id);
      }
      this.textures = { SKIN, CAPE };
    }
    if (type == "littleskin") {
      const tid = data.littleskinTid;
      const result = await fetch(`https://littleskin.cn/texture/${tid}`, { headers: Utils.requestHeaders }).catch(() => new Response(Buffer.from("{}"), { status: 500 }));
      if (!result.ok) {
        throw new ErrorResponse("BadOperation", `This tid is invalid in LittleSkin: ${tid}, or the server is temporarily unable to connect to LittleSkin.`);
      }
      const { hash, type: textureType }: any = await result.json();
      if (textureType != "cape") {
        const model = textureType == "steve" ? "default" : "slim";
        const skinData: TextureData = {
          url: `https://littleskin.cn/textures/${hash}`,
          metadata: {
            model: model,
          },
        };
        await Textures.remove(this.localRes.skin, this.id);
        this.textures.SKIN = skinData;
      } else {
        const skinData: TextureData = {
          url: `https://littleskin.cn/textures/${hash}`,
        };
        await Textures.remove(this.localRes.cape, this.id);
        this.textures.CAPE = skinData;
      }
    }
    if (type == "upload") {
      const { type: textureModel, file } = data.upload;
      const sha256 = Utils.sha256(file);
      let textureType: string;
      let skinData: TextureData;
      if (textureModel != "cape") {
        textureType = "skin";
        skinData = {
          url: `${CONFIG.server.root}yggdrasil/textures/${sha256}`,
          metadata: {
            model: textureModel == "default" ? "default" : "slim",
          },
        };
      } else {
        textureType = "cape";
        skinData = {
          url: `${CONFIG.server.root}yggdrasil/textures/${sha256}`,
        };
        this.capeVisible = true;
      }
      if (this.localRes[textureType]) {
        await Textures.remove(this.localRes[textureType], this.id);
      }
      this.textures[textureType.toUpperCase()] = skinData;
      this.localRes[textureType] = sha256;
      await Textures.add(file, this.id, sha256);
    }
    if (type == "capeVisible") {
      this.capeVisible = data.capeVisible;
    }
    await this.save();
    return this;
  }
  /** * 保存角色信息 */
  async save(): Promise<void> {
    PROFILEMAP.delete(this.id);
    PROFILEMAP.set([this.name, this.id], this);
    PROFILES[this.id] = this.export;
    await JSONFile.save(PROFILES);
  }
  async setName(newName: string): Promise<Profile> {
    USERSMAP.get(this.owner).checkReadonly();
    Profile.nameCheck(newName);
    this.name = newName;
    await this.save();
    return this;
  }
  /**
   * 导出符合 yggdrasil API 格式的角色信息
   * @param includeProperty (默认: false) 是否包括属性
   * @param signed (默认: false) 是否对属性进行数字签名
   * @returns {PublicProfileData}
   */
  getYggdrasilData(includeProperty: boolean = false, signed: boolean = false): PublicProfileData {
    const textures: TexturesData = {
      timestamp: new Date().getTime(),
      profileId: this.id,
      profileName: this.name,
      textures: Object.assign({}, this.textures),
    };
    if (this.capeVisible == false && textures.textures.CAPE) {
      delete textures.textures.CAPE;
    }
    if (!textures.textures.SKIN && CONFIG.user.enableDefaultSkin) {
      textures.textures.SKIN = {
        url: CONFIG.user.defaultSkin,
      };
    }
    const textureStr = Utils.encodeb64(JSON.stringify(textures));
    const result: PublicProfileData = {
      id: this.id,
      name: this.name,
      properties: includeProperty
        ? [
            {
              name: "textures",
              value: textureStr,
              signature: signed ? Utils.makeSignature(textureStr, PRIVATEKEY) : undefined,
            },
            {
              name: "uploadableTextures",
              value: this.uploadableTextures,
              signature: signed ? Utils.makeSignature(this.uploadableTextures, PRIVATEKEY) : undefined,
            },
          ]
        : undefined,
    };
    return JSON.parse(JSON.stringify(result));
  }
  /** 导出角色信息 */
  get export(): ProfileData {
    return {
      name: this.name,
      id: this.id,
      textures: this.textures,
      uploadableTextures: this.uploadableTextures,
      owner: this.owner,
      capeVisible: this.capeVisible,
      localRes: this.localRes,
    };
  }
}
