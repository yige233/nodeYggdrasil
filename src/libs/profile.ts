import { ProfileData, PublicProfileData, TextureData, TexturesData, model, uploadableTextures, uuid } from "./interfaces.js";
import Utils, { PROFILEMAP, PROFILES, CONFIG, USERSMAP, PRIVATEKEY, ErrorResponse } from "./utils.js";
import Textures from "./textures.js";

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
    Profile.nameCheck(name);
    if (!USERSMAP.has(userId)) {
      //指定的用户不存在
      throw new ErrorResponse("BadOperation", `Invalid userId: ${userId}`);
    }
    const user = USERSMAP.get(userId);
    if (user.profiles.length > CONFIG.content.user.maxProfileCount) {
      //用户所拥有的角色太多
      throw new ErrorResponse("ForbiddenOperation", "The user have too much profile.");
    }
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
  /** 将json形式的角色数据转换为Map */
  static buildMap(): Map<any, Profile> {
    const map: Map<any, Profile> = Utils.arrMap();
    for (const pid in PROFILES.content) {
      const profile = PROFILES.content[pid];
      map.set([profile.name, profile.id, profile.name.toLowerCase()], new Profile(profile));
    }
    return map;
  }
  /**
   * 检查角色名称是否合法
   * @param name 待检查的角色名称
   * @returns {true}
   */
  static nameCheck(name: string): true {
    name = name.toLowerCase();
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
   * 设置角色绑定的材质
   * @param type 进行何种操作。mojang:从正版用户获取皮肤和披风; littleskin:从littleskin的皮肤库获取皮肤; upload:上传的皮肤; delete:删除皮肤
   * @param data profileName: 正版用户id; littleskinTid: littleskin的皮肤id; type:进行删除操作时，指定删除披风还是皮肤还是两者; upload.type: 上传的材质的类别(默认、细手臂、披风); upload.file: 材质文件
   * @returns {Profile}
   */
  async setTexture(
    type: "mojang" | "littleskin" | "upload" | "capeVisible" | "delete",
    data: {
      profileName?: string;
      littleskinTid?: string;
      type?: "skin" | "cape" | "all";
      upload?: {
        type?: model | "cape";
        file: Buffer;
      };
      capeVisible?: boolean;
    }
  ): Promise<Profile> {
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
      const { id = null }: any = await fetch(`https://api.mojang.com/users/profiles/minecraft/${profileName}`, { headers: Utils.requestHeaders })
        .then((res) => res.json())
        .catch(() => {});
      if (!id) {
        throw new ErrorResponse("BadOperation", `This profile name is invalid in Mojang's API: ${profileName}, or the server is temporarily unable to connect to the Mojang API.`);
      }
      const {
        properties: [{ value = null }],
      }: Partial<PublicProfileData> = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`, { headers: Utils.requestHeaders })
        .then((res) => res.json())
        .catch(() => {
          return { properties: [] };
        });
      if (!value) {
        throw new ErrorResponse("BadOperation", "The server is temporarily unable to connect to the Mojang API, Please try again later.");
      }
      const {
        textures: { SKIN, CAPE },
      }: Partial<TexturesData> = JSON.parse(Utils.decodeb64(value));
      if (!SKIN && !CAPE) {
        throw new ErrorResponse("BadOperation", `This profile name has no skin or cape: ${profileName}, or the server is temporarily unable to connect to the Mojang API.`);
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
        this.textures.SKIN = skinData;
      } else {
        const skinData: TextureData = {
          url: `https://littleskin.cn/textures/${hash}`,
        };
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
          url: `${CONFIG.content.server.root}yggdrasil/textures/${sha256}`,
          metadata: {
            model: textureModel == "default" ? "default" : "slim",
          },
        };
      } else {
        textureType = "cape";
        skinData = {
          url: `${CONFIG.content.server.root}yggdrasil/textures/${sha256}`,
        };
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
  /**
   * 保存角色信息
   * @param deleteFlag (默认: false) 该操作是否为删除该角色
   */
  async save(deleteFlag: boolean = false): Promise<void> {
    PROFILEMAP.delete(this.id);
    if (deleteFlag) {
      //删除角色
      delete PROFILES.content[this.id];
      if (this.owner) {
        //如果该角色有所有者，从该所有者中删除该角色
        const owner = USERSMAP.get(this.owner);
        owner.profiles.splice(
          owner.profiles.findIndex((i) => i == this.id),
          1
        );
        await owner.save();
        PROFILEMAP.delete(this.id);
      }
    } else {
      PROFILEMAP.set([this.name, this.id], this);
      PROFILES.content[this.id] = this.export;
    }
    await PROFILES.save();
  }
  async setName(newName: string): Promise<Profile> {
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
    if (!this.capeVisible && textures.textures.CAPE) {
      delete textures.textures.CAPE;
    }
    if (!textures.textures.SKIN && CONFIG.content.user.enableDefaultSkin) {
      textures.textures.SKIN = {
        url: CONFIG.content.user.defaultSkin,
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
              signature: signed ? Utils.makeSignature(textureStr, PRIVATEKEY.toString("utf8")) : undefined,
            },
            {
              name: "uploadableTextures",
              value: this.uploadableTextures,
              signature: signed ? Utils.makeSignature(this.uploadableTextures, PRIVATEKEY.toString("utf8")) : undefined,
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
