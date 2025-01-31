import { RoutePackConfig } from "../libs/interfaces.js";
import schemas, { Packer } from "../libs/schemas.js";
import { UserServices } from "../services/user.js";

const rescueCode: RoutePackConfig = {
  url: "/rescue-code",
  /** 获取用户的救援码 */
  get: {
    handler: UserServices.generateRescueCode,
    schema: {
      summary: "获取用户的救援码",
      description: "只有在用户尚未生成救援码，且提供了有效的令牌时，才能通过此api获得救援码。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      response: {
        200: Packer.object("用户的救援码")({
          rescueCode: Packer.string("救援码"),
        }),
      },
    },
  },
};

const password: RoutePackConfig = {
  url: "/password",
  /** 忘记密码时，重置用户密码 */
  patch: {
    handler: UserServices.resetPassword,
    schema: {
      summary: "重置用户的密码",
      description: "一种可以自助重置密码的手段。重置密码后，原有的救援码会失效，而用户可以重新生成救援码。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      body: Packer.object("重置密码需要提供的信息")(
        {
          rescueCode: Packer.string("该用户的救援码"),
          newPassword: Packer.string("该用户的新密码"),
        },
        "rescueCode",
        "newPassword"
      ),
      response: { 204: schemas.Response204.ok },
    },
  },
};

const lock: RoutePackConfig = {
  url: "/lock",
  /** 锁定用户 */
  patch: {
    handler: UserServices.lock,
    schema: {
      summary: "锁定用户",
      description: "锁定用户，使其变为只读状态。需要提供有效账户名和密码。",
      tags: ["server"],
      body: schemas.RequestSignout,
      response: { 204: schemas.Response204.ok },
    },
  },
};

const inviteCode: RoutePackConfig = {
  url: "/invite-code",
  /** 用户生成一个邀请码 */
  get: {
    handler: UserServices.generateInviteCode,
    schema: {
      summary: "生成一个邀请码",
      description: "用户可以生成一个邀请码，可以用于注册新用户。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      response: {
        200: Packer.object("生成的邀请码")({
          inviteCode: Packer.string("邀请码"),
        }),
      },
    },
  },
  post: {
    handler: UserServices.editRemainingInviteCode,
    schema: {
      summary: "修改剩余可用的邀请码数量。",
      description: "修改该用户剩余可用的邀请码数量。需要管理员权限。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      body: Packer.object()({ addCount: Packer.integer("需要为该用户增加的的邀请码数量。可以是负数，从而减少该用户的剩余可用的邀请码数量。") }, "addCount"),
      response: { 204: Packer.object()({ remainingInviteCodeCount: Packer.integer("该用户剩余可用的邀请码数量。") }) },
    },
  },
};

/** 单个用户相关 */
const user: RoutePackConfig = {
  url: "/:uuid",
  /** 获取用户信息 */
  get: {
    handler: UserServices.get,
    schema: {
      summary: "获取单个用户的信息",
      description: "根据有无提供有效的令牌，会分别返回两种结果：公开的用户数据和私人可见的用户数据",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      response: { 200: schemas.PrivateUserData },
    },
  },
  /** 更新用户信息 */
  patch: {
    handler: UserServices.update,
    schema: {
      summary: "更新用户的信息",
      description: "目前可以修改以下项目：用户账户、密码和昵称。需要提供有效的令牌。管理员还可利用该API修改用户的最大角色数量限制。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      body: Packer.object("要更新的数据")({
        username: schemas.shared.username,
        password: schemas.shared.password,
        nickName: Packer.string("用户的昵称"),
        maxProfileCount: Packer.integer("用户的最大角色数量限制。提供该参数时，自动忽略其他参数，并检查请求发起者是否是管理员。该请求成功后，返回204响应。"),
      }),
      response: {
        200: schemas.PrivateUserData,
        204: schemas.Response204.ok,
      },
    },
  },
  /** 删除（注销）用户 */
  delete: {
    handler: UserServices.delete,
    schema: {
      summary: "删除用户",
      description: "删除指定的用户数据，包括拥有的角色和材质。需要提供有效的账号密码，url中的用户uuid也要是正确的",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      body: schemas.RequestSignout,
      response: {
        204: schemas.Response204.ok,
      },
    },
  },
  /** 救援码和找回密码 */
  routes: [rescueCode, password, inviteCode],
};

const schemaRegBody = Packer.object("注册需要的数据")(
  {
    username: schemas.shared.username,
    password: schemas.shared.password,
    inviteCode: Packer.string("邀请码"),
    nickName: Packer.string("该用户的昵称"),
  },
  "username",
  "password"
);

const schemaReg200 = Packer.object("注册结果")(
  Object.assign({}, schemas.MinimumUserData.properties, {
    error: Packer.string("注册该账户时产生的错误(若注册成功，则不存在)"),
    errorMessage: Packer.string("错误信息(同上)"),
  })
);

/** 用户这一集合相关 */
const users: RoutePackConfig = {
  url: "/users",
  /** 可以通过用户账户查询用户信息 */
  get: {
    handler: UserServices.queryUser,
    schema: {
      summary: "查询用户信息",
      description: "通过'user'请求参数，来查找对应的用户。通过302重定向自动跳转到对应用户的信息api端点。管理员可以通过提供'after'和'count'参数来查询用户列表。",
      tags: ["server"],
      querystring: Packer.object()({
        user: schemas.shared.usernameInput,
        after: Packer.string("同 user 参数。若该参数无效，则默认为系统中首个用户的 id"),
        count: Packer.integer("指定获取的用户列表的长度，默认为 10，最大为 100", 1, 100),
      }),
      response: { 302: schemas.Response204.ok, 200: Packer.array("查询命中的用户列表")(schemas.PublicUserData) },
    },
  },
  /** 注册新用户 */
  post: {
    handler: UserServices.newUser,
    schema: {
      summary: "注册新用户",
      description:
        "注册新用户。如果提供了有效的令牌，且令牌所有者是管理员，那么他可以一次性注册大量用户。请求体可以是单个数据对象，也可以是多个数据组成的数组。如果没有一个成功的注册结果，那么响应状态码将是400。不影响响应体。",
      tags: ["server"],
      body: Packer.anyOf(schemaRegBody, Packer.array("注册数据列表")(schemaRegBody)),
      response: {
        201: Packer.anyOf(schemaReg200, Packer.array("按照提供的数据顺序排列的注册结果列表")(schemaReg200)),
        400: Packer.anyOf(schemaReg200, Packer.array("按照提供的数据顺序排列的注册结果列表")(schemaReg200)),
      },
    },
    customResponse: true,
  },
  routes: [user, lock],
};
export default users;
