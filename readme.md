## node-yggdrasil-server

基于 Nodejs 的实现了[ Yggdrasil 服务端技术规范 ](https://github.com/yushijinhun/authlib-injector/wiki/Yggdrasil-%E6%9C%8D%E5%8A%A1%E7%AB%AF%E6%8A%80%E6%9C%AF%E8%A7%84%E8%8C%83)的 Yggdrasil 认证服务端

### 一些特点

- 无需配置数据库。如果只是想开个原版服/有一些开服经验，但不多/嫌配置数据库麻烦(比如我)，又觉得盗版服不安全，而且玩家数量不会很多，那么我认为这种无数据库式的外置登录验证服务器还是很香的。
- [yggdrasil-mock](https://github.com/yushijinhun/yggdrasil-mock)测试结果：`73 passing (18s)  4 failing` 4 个失败的原因是，材质 url 提供的 hash 与测试程序计算得出的不符。(不是很明白测试端是怎么计算的, mojang 官方材质 url 也会这样。)
- 前后端分离。在 yggdrasil API 之外，还提供了一套简单的 restful 的 API，借此可以深度修改网页端的用户界面，不会对服务器产生影响。(项目本身也有提供一个简陋的用户界面，具有基本的功能。不介意的话也能凑合用)
- 兼容正版用户进入服务器。也就是只需要服务器配置了本验证服务器就行。不过这样也带来了许多兼容问题，诸如不可预测的皮肤不显示什么的，而且在 1.19 及更新的服务端，由于聊天签名机制的引入，会导致正版玩家无法验证聊天消息，从而被服务器踢出。(但是可以通过安装一个插件解决：[freedomchat](https://modrinth.com/plugin/freedomchat))

### 安装/构建

| 步骤           | 命令/操作                                                             | 说明                                                   |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------ |
| 需求           | `Nodejs v18.16.0`                                                     | 因为想用 Nodejs 内建的`fetch()`，所以用了这个版本      |
| 下载           |                                                                       | 包括源代码和已经构建好的代码                           |
| 安装依赖       | `npm install --omit=dev`                                              | 不加`--omit=dev`的话，会同时下载开发需要的依赖         |
| 初始化程序     | `npm run init`                                                        | 得先创建配置文件和装数据的文件夹，程序才不会运行不起来 |
| 获取公钥和私钥 | 初始化程序后别急着退出，会告诉你的                                    | 不用想这是啥，反正服务器需要就是了                     |
| 修改配置文件   | 打开`./data/config.json`，参考[配置文件](#配置文件)的说明，修改，保存 | 直接运行也不是不行，但是要让服务器能给其他人用是不够的 |
| 运行           | `npm start`                                                           | 也可以用 `npm ./build/index.js`                        |
| 构建           | `npm run build`                                                       | 前提是安装了开发需要的依赖包                           |

### 配置文件

```jsonc
{
  "server": {
    "host": "", //(关键)服务器监听的地址(空字符串被视为监听所有地址)。可以填某个单独的IP地址；填0.0.0.0就是监听所有的ipv4地址；填127.0.0.1就是只监听本地地址。
    "port": 5400, //(关键)验证服务器使用的端口。不和其他程序冲突了就行。如果冲突了，程序会直接运行不了。
    "name": "NodeYggdrasilServer", //验证服务器的名称，一些启动器会把这个显示给玩家看。
    "root": "http://localhost:5400/", //(关键)这项是服务器最终对外开放时的根路径。用于向用户提示 Yggdrasil API 的地址(以斜杠'/'结尾)，并在用户上传材质时构建正确的材质url。也就是说填写错误的话，启动器会找不到服务器，以及不能加载用户上传的材质。
    "homepage": "http://localhost:5400/", //服务器的主页地址。
    "register": "http://localhost:5400/", //服务器的注册页地址。
    "keyReqRateLimit": 300, //关键请求速率限制。作用于影响用户账户安全的api。(毫秒)
    "proxyCount": 0, //服务器前方的代理服务器数量，包括nginx、apache、cloudflare或者其他的cdn。该项决定了程序如何获取用户的ip地址，并避免获取到伪造的ip地址。如果此项不为0，前面的host一定要填127.0.0.1。
    "trustXRealIP": false //是否信任由 x-real-ip 请求头提供的IP地址。如果为true，前面的host一定要填127.0.0.1。相对于上一项，该项的优先级最高。
  },
  "user": {
    "tokenValidityPeriod": 336, //用户登录令牌的过期时间(小时)。令牌的暂时失效时间为该时间的一半。
    "passLenLimit": 8, //用户密码最短长度。姑且还是要注意一下密码安全（
    "maxProfileCount": 5, //单个用户最多可以拥有的角色的数量。
    "inviteCodes": [], //系统邀请码。用户注册机制采用了邀请码机制，需要拥有邀请码才能注册。系统邀请码不受下面的使用频率限制，因此要注意防止泄露。
    "inviteCodeUseRateLimit": 3600, //邀请码使用频率限制(分钟)。由于每个用户都会有一个邀请码，所以需要这个限制，来避免短时间内大量注册用户。新用户的邀请码会一开始就加上这个冷却时间。
    "disableUserInviteCode": false, //是否禁用用户邀请码。
    "enableOfficialProxy": false, //是否启用兼容正版登录(会带来的兼容性问题已经在上面说了，所以默认是关闭的)。
    "disableUploadTexture": false //是否禁用从本机上传皮肤。
  },
  "privateKeyPath": "./data/privkey.pem", //程序使用的私钥路径。
  "publicKeyPath": "./data/pubkey.pem", //程序使用的公钥路径。
  "skinDomains": ["littleskin.cn", ".littleskin.cn", "localhost", ".minecraft.net"], //允许加载的皮肤域名。如果本服务器有用户上传的皮肤，需要把本服务器的域名填在里面。
  "features": {
    "non_email_login": true, //是否允许使用角色名登录。
    "username_check": false, //是否禁止带有汉字字符的玩家进入。
    "no_mojang_namespace": false, //是否禁用 authlib-injector 的 Mojang 命名空间。不懂就不用改。
    "enable_mojang_anti_features": false //是否开启 Minecraft 的 anti-features。不懂就不用改。
  },
  "pubExtend": {
    //这里是公共可见的扩展字段，可以存储一些额外的信息。
    "headerInfo": "可以是一段公告" //比如这个就是本项目自带的用户界面使用的一个字段，用于向所有人展示公告消息。
  },
  "privExtend": {
    //仅管理员可见的私有扩展字段。
    "enableSwaggerUI": false //启用内置的 swagger API 文档页面。其路径为: /docs。需要重启服务。（程序依赖的一个解析formdata的插件引入了 swagger，那么正好加以利用
  }
}
```

#### 开始使用

<i>不要忘记先修改配置文件中的关键部分。</i>

<i>要求提供用户名、角色名和 uuid 的多数场合，都是大小写不敏感的。角色名在显示时会保留大小写状态。</i>

- 服务器一开始是没有任何账户的，所以你需要打开服务器的用户注册界面，创建第一个用户。地址可以是`http://localhost:5400/`。创建第一个账户不需要使用邀请码，且会自动成为管理员账户。用户名需要是个邮箱，原因是防止某些启动器把账号+密码登录误认为角色名+密码登录。昵称目前没有任何卵用，只是觉得应该有这么个玩意……
- 然后就可以开始创建第一个角色了。角色名称可以填中文，但总长度要小于 30 位。`是否兼容离线验证`可以让生成的角色的 uuid 和离线模式的一致。若使用的是本项目自带的用户界面，那么刷新页面，就可以编辑刚刚创建的角色了。可以从 Mojang 复制一位正版角色、从 littleSkin 导入材质或披风，也可以在服务器允许的情况下自行上传。
- 为服务端启用外置登录，可参见[在 Minecraft 服务端使用 authlib injector](https://github.com/yushijinhun/authlib-injector/wiki/%E5%9C%A8-Minecraft-%E6%9C%8D%E5%8A%A1%E7%AB%AF%E4%BD%BF%E7%94%A8-authlib-injector)。
- 对于启动器来说，如果支持拖入，那么把网页最上方的`也可以拖动此链接到支持的启动器`拖动到启动器里就可以(对于本项目自带的用户界面)，之后登录即可。
- 管理员可以封禁一位用户。提供用户 UUID、角色 UUID 或角色名称，以及封禁时长(分钟)。多次封禁时长不叠加。将封禁时长设为 0，即可视为解封用户。封禁会强制注销该用户的所有会话。被封禁期间，无法登录、无法删除用户，也不能使用该用户的邀请码注册新用户。
- 管理员也拥有批量注册用户的权限。对于本项目自带的用户页面来说，上传`usercache.json`，就可以批量为服务器里的玩家创建账户。对于本项目自带的用户界面，批量创建后的密码是`角色名1234567`。这里同样需要邀请码，而用户邀请码同样会受到冷却的限制，所以建议使用系统邀请码。
- 管理员还可以自由修改服务器设置，可以通过web修改除 `privateKeyPath`、`publicKeyPath`、`server.host`、`server.root` 和 `server.port` 之外的任何其他配置项。但是只能修改已存在的项，不能新增项也不能删除项。
- 为了防止忘记密码后无法登录，设计了一套救援码系统。用户登录后可以生成一个救援码，忘记密码时可以通过该救援码重置密码。救援码需要由用户自行保存，且服务器只会生成一次。对于没有生成过救援码的账户，就没法找回了。

### 所以到底怎么获取公钥和私钥

考虑到多数人的操作系统上都没有能直接用的 openssl，用这个生成网站最方便了。而且反正是一劳永逸的操作，程序也没有实现`feature.enable_profile_key`的打算，就这样吧。

1. 打开 https://www.cryptool.org/en/cto/openssl 。其加载完毕后会出现一个终端黑框。
2. 在终端中依次输入以下命令：

```shell
openssl genrsa -out privkey.pem 409
openssl rsa -pubout -in /privkey.pem -outform PEM -out pubkey.pem
```

3. 点击终端下方的 `Files` 按钮，下载 `privkey.pem` 和 `pubkey.pem`。
4. 将两个 `.pem` 文件放入本程序下面的 `data` 文件夹中。

<i> 该网站使用了 `WebAssembly` 技术，密钥的创建实际上完全是在你的电脑上完成的。</i>

