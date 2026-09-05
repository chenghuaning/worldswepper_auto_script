
![](./img/game.png " ")

## 🎮 关于 WorldSweeper 游戏 (About the Game)

[WorldSweeper](https://worldsweeper.site) 是一款将**经典扫雷**与**真实地球地理、Roguelite RPG 角色养成**深度融合的创新网页游戏。

不同于传统扫雷“踩雷即暴毙”的严苛规则，WorldSweeper 引入了生命值、护甲、职业技能树与局外养成系统，玩家将在由数千万像素点构成的真实世界地图上展开探索与征服。

---

### 🌟 核心玩法机制

- 🗺️ **全球真实地理与国家征服 (World Map Conquest)**  
  游戏地图基于真实地球地形构建（尺寸高达 `25088 × 12544`）。当玩家翻开一个国家 **80%** 的安全地块时即可成功征服该国；征服大洲内的所有国家后，将解锁整个大洲的征服成就与丰厚赏金。
- ❤️ **生命值与容错机制 (HP & Armor System)**  
  踩中地雷不会立即导致游戏失败，而是扣除相应生命值（受护甲与减伤影响）。玩家可以通过升级回血、技能吸收伤害或利用拆弹套件（Defuse Kits）安全排雷。
- 🚩 **动态旗帜上限与双击连锁 (Flag Limit & Chording)**  
  玩家拥有固定上限的旗帜容量，不可无脑全图插旗，需合理拔旗与复用；当数字周围标记的旗帜数与雷数匹配时，点击数字可触发 **连锁开辟（Chording）**。

---

### ⚔️ 五大特色初始职业 (Starter Builds)

| 职业名称 | 定位与特色 | 核心初始技能 | 优势与权衡 |
| :--- | :--- | :--- | :--- |
| **Scout (侦察兵)** | 视野感知 / 探图先锋 | `Pulse (主动脉冲)` | 探测大范围隐藏地雷；生命值较低，容错率较低 |
| **Demolitionist (爆破手)** | 强力连锁 / 高风险清图 | `Overload (被动过载)` | 翻开地块时产生连锁爆破与大范围开辟；初始旗帜较少 |
| **Technician (技师)** | 稳健排雷 / 战术大师 | `Defuse (主动拆弹)` | 消耗拆弹套件直接安全排雷，排雷成功可回收套件；推图节奏偏稳 |
| **Gambler (赌徒)** | 概率博弈 / 极高收益 | `Gamble (主动赌博)` | 概率直接无损探开盲区地块，额外金币与经验加成；防御与生命极低 |
| **Survivor (幸存者)** | 坚韧生存 / 新手推荐 | `Brace (被动格挡)` | 吸收高额地雷伤害，翻开数字地块获得生命回复；推图收益较低 |

---

### 🗺️ 双模式设计 (Game Modes)

- 🎲 **经典模式 (Classic Mode)**：单局独立探索，每次死亡或重开都会生成全新的随机世界与种子。
- 🏰 **战役模式 (Campaign Mode)**：**地图持久化保留**。角色死亡后已翻开的地块、征服进度与已开启的宝箱均会永久保留，玩家可更换新职业在原有世界地图上继续推进。

---

### 🏛️ 地图特殊地块与交互机制 (Field Hazards & POIs)

随着探索深入，地图上会随机生成与生物群系相关的特殊事件地块：

- 🎁 **宝箱 (Treasure Chest)**：提供金币、经验、被动词条与稀有装备，部分宝箱可能会伪装成**宝箱怪（Mimic）**造成伤害。
- 🌋 **金币喷口 (Gold/Steam Vent)**：消耗少量生命值进行排气，直接获取大量金币与经验。
- ⛩️ **神殿 (Shrine)**：通过献祭生命换取强力增益，提供 **透视周边地雷 (Sight)**、**财富抽取 (Fortune)** 或 **临时护甲祝福 (Ward)**。
- 🥀 **枯萎之花 (Blight Bloom)**：危险地块，若翻开后未及时使用工具封印，苏醒后将对周边区域持续造成范围伤害。

---

## 📖 项目简介 (Overview)

**WorldSweeper_Auto_Script** 是一款专为网页端游戏 [WorldSweeper](https://worldsweeper.site) 打造的高性能全自动用户脚本（Userscript）,是基于宿主游戏底层确定性哈希逆向与 React Fiber 自动捕获的全自动、全知级扫雷与宝藏收割机器人。

不同于传统的基于概率推测或穷举回溯的扫雷 AI，本项目通过完全逆向游戏底层的 **确定性伪随机哈希算法（Deterministic PRNG Hashing）** 与 **生物群系特征分布（Biome Multipliers）**，实现了对全图地块的 100% 绝对预测。在保证绝对避雷的前提下，全图优先秒抢宝箱（Treasure Chest）与金币喷口（Gold Vent），并具备毫秒级响应的紧急制动与防卡死渲染节流机制。

---

## ✨ 核心特性 (Key Features)

- 🧬 **React Fiber 自动捕获注入 (Automated Fiber State Extraction)**
  - 内置 DOM 虚拟节点回溯机制，从 Canvas 向上遍历 Hook 链表，毫秒级全自动提取 `world` / `session` / `view`。
  - 彻底摆脱对 React DevTools 插件及手动控制台敲命令的依赖，100% 全自动挂载。
- 🔮 **全知级逆向透视引擎 (Full Mathematical Oracle)**
  - 100% 精确推演地雷 (`Mine`)、宝箱 (`Treasure Chest`)、金币喷口 (`Gold Vent`)、神殿 (`Shrine`) 与枯萎之花 (`Blight Bloom`)。
  - 完美复刻 12 种生物群系（海洋、草地、沙漠、火山等）生成权重与倍率修正。
- 🎯 **5 级多优先级寻路系统 (Smart Priority Pathfinder)**
  - `P4 - 已揭示可交互地块`：优先触发翻开后的宝箱开箱与喷口金币提取。
  - `P3 - 宝箱目标`：优先开辟未翻开的隐藏宝箱。
  - `P2 - 金币喷口`：次优先开辟金币喷口。
  - `P1 - 神殿/枯萎花`：及时定位并处理危险/增益地块。
  - `P0 - 常规安全地块`：九宫格 BFS 扩散与蒙特卡洛全局保底探索。
- ⚡ **零延迟即按即停与全局急停 (Zero-Latency Emergency Brake)**
  - 采用 `pointerdown` / `mousedown` 监听替代传统 `click`，按下瞬间中断调度。
  - 全局键盘热键支持：敲击 `Space`**（空格）** 或 `ESC` 实现 1ms 内硬性急停。
- 🛡️ **全职业血量自适应与开局防假死 (Adaptive Health Parsing)**
  - 兼容全部职业（Scout、Demo、Tech、Gambler、Survivor）的不同生命值数据结构。
  - 内置初始化保护边界，杜绝数据异步加载导致的开局误判死亡问题。
- 🚀 **UI 渲染节流与主线程防拥堵 (Throttled UI Rendering)**
  - DOM 文本刷新节流（默认 200ms），大幅降低高频重排（Reflow）开销，确保高帧率流畅运行。
- 🤖 **全自动挂机与秒选技能 (Auto-Pick Modals)**
  - 支持自动拾取宝箱掉落、自动确认升级技能与神殿交互。


---



## 🏗️ 架构与分层设计 (Architecture)

项目遵循 **SOLID** 原则与模块化解耦规范，采用纯原生 JavaScript (ES2022) 开发，代码分层如下：

```text
┌──────────────────────────────────────────────────────────┐
│                   WorldSweeperBot (主控应用)              │
│       (生命周期管理 · 状态机维护 · 键盘热键绑定 · 循环调度)    │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
    ┌────────▼─────────┐          ┌────────▼─────────┐
    │ GameStateAdapter │          │   UIController   │
    │(Fiber自动状态提取)│          │ (悬浮窗与渲染节流)│
    └────────┬─────────┘          └──────────────────┘
             │
    ┌────────▼─────────────────────────────────────────┐
    │             SmartPriorityPathfinder              │
    │  (5级优先级队列 · BFS邻域扩散 · 蒙特卡洛全局扫描) │
    └────────┬─────────────────────────────┬───────────┘
             │                             │
    ┌────────▼─────────┐          ┌────────▼─────────┐
    │ FullOracleEngine │          │CanvasInputDispatcher│
    │(底层哈希逆向计算)│          │ (视口变换与事件合成) │
    └──────────────────┘          └──────────────────┘
```



### 核心模块职责说明


| 模块名称                      | 职责定位           | 核心方法 / 特性                                                          |
| ------------------------- | -------------- | ------------------------------------------------------------------ |
| `GameStateAdapter`        | 宿主交互与 Fiber 提取 | `autoCaptureFiberState()`（React 19 自动探查）、`resolveHealth()`         |
| `FullOracleEngine`        | 纯数学计算层         | `hashMine()`, `predictPoi()`, `isInteractable()`, `resolveBiome()` |
| `SmartPriorityPathfinder` | 寻路与调度决策        | `addNeighbors()`, `findGlobalSafeTile()`, `getNextMove()`          |
| `CanvasInputDispatcher`   | 输入与视口代理        | `dig()`（视口平移缩放居中与 PointerEvent 合成派发）                               |
| `UIController`            | 交互面板与渲染        | `mount()`, `setStatus()`（节流机制）, `setRunningState()`                |
| `WorldSweeperBot`         | 核心主控与状态机       | `bootstrap()`, `toggle()`, `start()`, `stop()`, `tick()`           |


---



## 🧬 React Fiber 自动捕获原理 (Automated Fiber Extraction)

游戏基于 **React 19** 构建，函数式组件内的状态被封装在闭包与 Fiber 虚拟节点中。脚本内置了自动状态嗅探器，工作原理如下：

```text
DOM 渲染树                  Fiber 虚拟节点链表                    运行时状态挂载
[ <canvas> ] 
     │
     └──> 读取 __reactFiber$私有属性
               │
               └──> 向上回溯父级 Fiber 节点 (node.return)
                         │
                         └──> 遍历 hook 链表 (memoizedState)
                                   │
                                   ├── hook.memoizedState.current (useRef) ──> 提取 world / session / view
                                   └── hook.memoizedState[0] (useState)   ──> 提取 meta
                                             │
                                             └──> 自动挂载至 unsafeWindow.__GAME (Ready!)
```

---



## ⚙️ 底层逆向算法与推演逻辑 (Algorithm Implementation)

游戏内的所有地图特征（地雷、宝箱、金币喷口、神殿、枯萎花）全部由**确定性伪随机哈希（Deterministic PRNG）**在客户端实时计算，无需等待网络请求。

### 1. 核心 32 位整数混淆函数 (`hashU32`)

```javascript
/**
 * 32位无符号整数位混淆器
 * @param {number} value - 待混淆的整数输入
 * @returns {number} 0 ~ 4294967295 范围的伪随机无符号整数
 */
function hashU32(value) {
    let t = value | 0;
    t = Math.imul(t ^ (t >>> 16), 2146121005); // 阶段1：异或高16位后乘以质数
    t = Math.imul(t ^ (t >>> 15), 2221713035); // 阶段2：异或高15位后乘以质数
    return ((t ^ (t >>> 16)) >>> 0);           // 阶段3：无符号右移转为 U32
}
```



### 2. 五大地图特征推演算法 (Feature PRNG Formulas)

每个地块通过传入 `(seed, x, y)` 及固定的**盐值偏移（Salt Offsets）**计算独立哈希，并与生物群系修正后的阈值对比：

```javascript
// ==================== [1] 地雷预测 (Mine) ====================
// 判定依据: hashMine(seed, x, y) < world.densityU32 (通常为 0.15625 * 2^32)
function hashMine(seed, x, y) {
    const hx = hashU32(x + 1);
    const hy = hashU32(Math.imul(y + 1, 374761393));
    return hashU32(hx ^ hy ^ seed);
}

// ==================== [2] 宝箱预测 (Treasure Chest) ====================
// 基础生成率: 0.4% * 生物群系宝箱倍率 (chestMult)
function hashTreasure(seed, x, y) {
    const saltSeed = seed ^ 2779096485;
    const hx = hashU32(x + 17);
    const hy = hashU32(Math.imul(y + 31, 668265263));
    return hashU32(hx ^ hy ^ saltSeed);
}

// ==================== [3] 金币喷口预测 (Gold Vent) ====================
// 基础生成率: 0.15% * 生物群系喷口倍率 (ventMult)
function hashVent(seed, x, y) {
    const saltSeed = seed ^ 1374510711;
    const hx = hashU32(x + 23);
    const hy = hashU32(Math.imul(y + 41, 374761393));
    return hashU32(hx ^ hy ^ saltSeed);
}

// ==================== [4] 神殿预测 (Shrine) ====================
// 基础生成率: 0.05% * 生物群系神殿倍率 (shrineMult)
function hashShrine(seed, x, y) {
    const saltSeed = seed ^ 3237998097;
    const hx = hashU32(x + 29);
    const hy = hashU32(Math.imul(y + 53, 374761393));
    return hashU32(hx ^ hy ^ saltSeed);
}

// ==================== [5] 枯萎之花预测 (Blight Bloom) ====================
// 基础生成率: 0.02% * 生物群系枯萎倍率 (blightMult)
function hashBlight(seed, x, y) {
    const saltSeed = seed ^ 2970294910;
    const hx = hashU32(x + 37);
    const hy = hashU32(Math.imul(y + 67, 374761393));
    return hashU32(hx ^ hy ^ saltSeed);
}
```



### 3. 全局决策流程 (Decision Flowchart)

```text
输入目标坐标 (x, y):
 ├── 1. 越界检查 或 非陆地地块 (isLand === false) ──> [丢弃]
 ├── 2. 属于出生点 3x3 安全区 ─────────────────────> [直接判定为绝对安全]
 ├── 3. 判定是否为地雷 (hashMine < densityU32) ──────> [绝对避开，禁止点击]
 └── 4. 确认安全后，匹配 POI 类型并分流至优先级队列：
        ├── [P4] 已翻开且未收取的宝箱 / 喷口 ───────> 紧急交互队列 (Interact Queue)
        ├── [P3] 未翻开的宝箱 (hashTreasure 命中) ────> 宝箱队列 (Chest Queue)
        ├── [P2] 未翻开的金币喷口 (hashVent 命中) ───> 金币队列 (Vent Queue)
        ├── [P1] 未翻开的神殿/枯萎花 ───────────────> 特殊事件队列 (POI Queue)
        └── [P0] 常规无特殊属性安全地块 ────────────> 普通探索队列 (Normal Queue)
```

---



## 🚀 快速上手 (Quick Start)



### 1. 前置准备

安装任意一款支持用户脚本的现代浏览器扩展：

- [Tampermonkey (篡改猴)](https://www.tampermonkey.net/)
- [Violentmonkey (暴力猴)](https://violentmonkey.github.io/)



### 2. 安装与使用

1. 打开 Tampermonkey 管理面板，点击 **新建脚本 (+)**。
2. 复制项目源码中的 `WorldSweeper.user.js` 并粘贴保存。
3. 打开 [https://worldsweeper.site/](https://worldsweeper.site/) 进入游戏。
4. **完全无需手动注入**，脚本将在后台自动完成 Fiber 探查。当右下角面板显示 `Status: Ready` 时，点击 `START` 或按下 `空格键` 即可开始挂机！

---



## 🎮 快捷键与操作说明 (Controls)


| 操作方式             | 对应功能          | 说明                              |
| ---------------- | ------------- | ------------------------------- |
| `Space`**（空格键）** | **紧急暂停 / 继续** | 全局有效，敲击瞬间 1ms 内硬性中断主循环          |
| `ESC`**（退出键）**   | **紧急暂停 / 继续** | 与空格键功能相同                        |
| **鼠标点击** `Stop`  | **停止运行**      | 采用 `pointerdown` 监听，光标按下即停，绝不漏点 |
| **勾选** `自动秒选`    | **全自动挂机**     | 自动触发升级选项、自动开启宝箱并拾取战利品           |


---



## 🔧 运行配置项说明 (Configuration)

如需调整运行参数，可直接修改脚本顶部的 `CONFIG` 冻结对象：

```javascript
const CONFIG = Object.freeze({
    TICK_INTERVAL_MS: 50,              // 主调度循环执行周期 (毫秒) - 越小速度越快
    UI_THROTTLE_MS: 200,               // UI 文本渲染节流周期 (毫秒) - 释放主线程
    DEFAULT_DIG_ZOOM: 16.0,            // 模拟点击时的聚焦缩放倍率
    MAX_RANDOM_SEARCH_ATTEMPTS: 50000, // 全局保底蒙特卡洛采样扫描次数
});
```

---



## 🛠️ 代码规范与静态检查 (Code Quality)

本项目遵循严格的代码规范：

- **ESLint 0 告警**：通过严格的 `no-undef`, `no-multi-spaces`, `no-redeclare` 等规则。
- **全量 JSDoc 注解**：类、静态方法、函数入参及返回值均具备规范类型标注。
- **环境安全声明**：严格作用域隔离与可选链安全防护（`?.`），不污染宿主全局变量。

---



## 📜 免责声明 (Disclaimer) & License

本项目仅供代码重构、逆向工程与前端自动化测试等学术研究交流使用。请合理使用本脚本，请勿用于破坏游戏在线公平性竞技排名。

本项目基于 [MIT License](LICENSE) 协议开源。