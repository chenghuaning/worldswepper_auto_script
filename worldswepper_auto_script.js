// ==UserScript==
// @name         WorldSweeper (Pixel-Perfect Oracle & Treasure Hunter - Turbo Spiral)
// @namespace    https://github.com/chenghuaning/worldswepper_auto_script
// @version      33.0.0
// @description  全知透视扫雷【螺旋轰炸修正版】：修复开局扫海洋秒停问题、以出生点为中心高速引爆、神殿自动秒退、视窗解离零抖动。
// @author       WorldSweeper Engineering Team
// @license      MIT
// @match        https://worldsweeper.site/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

/*create by deepseek chat and gemini-3.7-flash*/
/*想起来就更新（*/
/*关注Neurosama谢谢喵，关注Vedal987谢谢喵，关注CerberVT谢谢喵*/
/* eslint-env browser, es2022 */
/* eslint-disable no-bitwise */
(function () {
    'use strict';

    // =========================================================================
    // 1. 地形与生物群系常量配置 (Biome & Rate Tables)
    // =========================================================================
    const BIOMES = Object.freeze({
        OCEAN: 0,
        COAST: 1,
        FOREST: 2,
        GRASSLAND: 3,
        DESERT: 4,
        MOUNTAIN: 5,
        TUNDRA: 6,
        TROPICAL: 7,
        ROCKY: 8,
        VOLCANIC: 9,
        ICE: 10,
        URBAN: 11,
    });

    const BIOME_DATA = Object.freeze({
        [BIOMES.OCEAN]: { ventMult: 0, shrineMult: 0, blightMult: 0, chestMult: 0, ventDamage: 12 },
        [BIOMES.COAST]: { ventMult: 0.8, shrineMult: 1, blightMult: 0.4, chestMult: 1, ventDamage: 8 },
        [BIOMES.FOREST]: { ventMult: 1, shrineMult: 1, blightMult: 1.8, chestMult: 1.2, ventDamage: 12 },
        [BIOMES.GRASSLAND]: { ventMult: 1, shrineMult: 1, blightMult: 1, chestMult: 1, ventDamage: 12 },
        [BIOMES.DESERT]: { ventMult: 2, shrineMult: 1, blightMult: 0.3, chestMult: 1, ventDamage: 16 },
        [BIOMES.MOUNTAIN]: { ventMult: 1, shrineMult: 2, blightMult: 1, chestMult: 1, ventDamage: 14 },
        [BIOMES.TUNDRA]: { ventMult: 0.5, shrineMult: 1, blightMult: 0.8, chestMult: 1, ventDamage: 12 },
        [BIOMES.TROPICAL]: { ventMult: 1.4, shrineMult: 1, blightMult: 1.6, chestMult: 1, ventDamage: 12 },
        [BIOMES.ROCKY]: { ventMult: 1.6, shrineMult: 1, blightMult: 1.3, chestMult: 1, ventDamage: 12 },
        [BIOMES.VOLCANIC]: { ventMult: 2.4, shrineMult: 1, blightMult: 1.5, chestMult: 1, ventDamage: 18 },
        [BIOMES.ICE]: { ventMult: 0.2, shrineMult: 1.8, blightMult: 1.1, chestMult: 1, ventDamage: 12 },
        [BIOMES.URBAN]: { ventMult: 1, shrineMult: 1.5, blightMult: 0.5, chestMult: 1.6, ventDamage: 12 },
    });

    const CONFIG = Object.freeze({
        TICK_INTERVAL_MS: 20,          // 调度周期 (20ms 高频)
        MAX_DIGS_PER_TICK: 4,          // 单帧连发数
        UI_THROTTLE_MS: 200,
        READY_POLL_INTERVAL_MS: 400,
        SAFE_HP_RATIO_FOR_VENT: 0.60,
        BASE_RATES: {
            vent: 0.0015,
            shrine: 0.0005,
            blight: 0.0002,
            treasure: 0.004,
        },
        TILE_STATE: {
            UNOPENED: 0,
            FLAGGED: 1,
            REVEALED: 2,
            EXPLODED: 3,
        },
        MODAL_KEYWORDS: [
            'choose', 'take', 'select', '确认', '选择',
            'claim', 'pay', 'open', 'vent', 'seal', 'bargain',
            'offer', 'loot', 'keep playing', 'walk away', 'leave',
        ],
        UI: {
            THEME_COLOR: '#7ec8dc',
            STOP_COLOR: '#ff7b72',
            BG_COLOR: 'rgba(0, 0, 0, 0.92)',
            TEXT_COLOR: '#f4f0e4',
        },
    });

    // =========================================================================
    // 2. 高性能 O(1) 快速队列
    // =========================================================================
    class FastPointerQueue {
        constructor() {
            this.items = [];
            this.head = 0;
        }

        push(item) {
            this.items.push(item);
        }

        shift() {
            if (this.head >= this.items.length) return null;
            const item = this.items[this.head++];
            if (this.head > 4000 && this.head * 2 >= this.items.length) {
                this.items = this.items.slice(this.head);
                this.head = 0;
            }
            return item;
        }

        get length() {
            return this.items.length - this.head;
        }

        clear() {
            this.items.length = 0;
            this.head = 0;
        }
    }

    // =========================================================================
    // 3. 逆向推演与全知预测引擎 (Oracle Engine)
    // =========================================================================
    class FullOracleEngine {
        static hashU32(e) {
            let t = e | 0;
            t = Math.imul(t ^ (t >>> 16), 2146121005);
            t = Math.imul(t ^ (t >>> 15), 2221713035);
            return ((t ^ (t >>> 16)) >>> 0);
        }

        static hashMine(seed, x, y) {
            return this.hashU32(this.hashU32(x + 1) ^ this.hashU32(Math.imul(y + 1, 374761393)) ^ seed);
        }

        static hashTreasure(seed, x, y) {
            const r = seed ^ 2779096485;
            return this.hashU32(this.hashU32(x + 17) ^ this.hashU32(Math.imul(y + 31, 668265263)) ^ r);
        }

        static hashGeneric(seed, x, y, r, i, a) {
            const o = seed ^ r;
            return this.hashU32(this.hashU32(x + i) ^ this.hashU32(Math.imul(y + a, 374761393)) ^ o);
        }

        static hashVent(seed, x, y) { return this.hashGeneric(seed, x, y, 1374510711, 23, 41); }
        static hashShrine(seed, x, y) { return this.hashGeneric(seed, x, y, 3237998097, 29, 53); }
        static hashBlight(seed, x, y) { return this.hashGeneric(seed, x, y, 2970294910, 37, 67); }

        static toThreshold(rate) {
            return Math.floor(rate * 4294967296);
        }

        static isLand(world, x, y) {
            if (!world || !world.land) return false;
            if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) return false;
            const idx = y * world.cols + x;
            return (world.land[idx >>> 3] & (1 << (idx & 7))) !== 0;
        }

        static getTileState(world, x, y) {
            if (!world || !world.state) return 0;
            const idx = y * world.cols + x;
            return (world.state[idx >>> 2] >> ((idx & 3) << 1)) & 3;
        }

        static isStartZone(world, x, y) {
            if (!world.seeded || world.safeX < 0) return false;
            return Math.max(Math.abs(x - world.safeX), Math.abs(y - world.safeY)) <= 1;
        }

        static isMine(world, x, y) {
            if (!this.isLand(world, x, y)) return false;
            if (this.isStartZone(world, x, y)) return false;
            return this.hashMine(world.seed, x, y) < world.densityU32;
        }

        static countAdjacentMines(world, x, y) {
            let count = 0;
            const cols = world.cols;
            const rows = world.rows;

            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= rows) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    if (nx < 0 || nx >= cols) continue;
                    if (this.isMine(world, nx, ny)) count++;
                }
            }
            return count;
        }

        static resolveBiome(world, x, y) {
            if (!this.isLand(world, x, y)) return BIOMES.OCEAN;
            if (!world.biomes?.length || world.biomeW <= 0 || world.biomeH <= 0) return BIOMES.GRASSLAND;
            const ox = Math.min(world.biomeW - 1, Math.max(0, (x * world.biomeW / world.cols) | 0));
            const oy = Math.min(world.biomeH - 1, Math.max(0, (y * world.biomeH / world.rows) | 0));
            const biomeIdx = oy * world.biomeW + ox;
            const raw = world.biomes[biomeIdx] ?? BIOMES.GRASSLAND;
            return (raw < 0 || raw >= 12) ? BIOMES.GRASSLAND : raw;
        }

        static getBiomeMetadata(world, x, y) {
            const b = this.resolveBiome(world, x, y);
            return BIOME_DATA[b] || BIOME_DATA[BIOMES.GRASSLAND];
        }

        static predictPoi(world, x, y) {
            if (!this.isLand(world, x, y) || this.isMine(world, x, y) || this.isStartZone(world, x, y)) {
                return null;
            }

            const idx = y * world.cols + x;
            if (world.debugHazards?.get(idx)) return world.debugHazards.get(idx);
            if (world.debugTreasures?.has(idx)) return 'treasure';

            const meta = this.getBiomeMetadata(world, x, y);
            const seed = world.seed;

            if (this.hashBlight(seed, x, y) < this.toThreshold(CONFIG.BASE_RATES.blight * meta.blightMult)) return 'blight';
            if (this.hashShrine(seed, x, y) < this.toThreshold(CONFIG.BASE_RATES.shrine * meta.shrineMult)) return 'shrine';
            if (this.hashVent(seed, x, y) < this.toThreshold(CONFIG.BASE_RATES.vent * meta.ventMult)) return 'vent';
            if (this.hashTreasure(seed, x, y) < this.toThreshold(CONFIG.BASE_RATES.treasure * meta.chestMult)) return 'treasure';

            return null;
        }

        static isPendingChest(world, x, y) {
            if (this.getTileState(world, x, y) !== CONFIG.TILE_STATE.REVEALED) return false;
            const idx = y * world.cols + x;
            return this.predictPoi(world, x, y) === 'treasure' && !world.openedChests.has(idx);
        }

        static isPendingVent(world, x, y, isHealthSafe) {
            if (!isHealthSafe || this.getTileState(world, x, y) !== CONFIG.TILE_STATE.REVEALED) return false;
            const idx = y * world.cols + x;
            return this.predictPoi(world, x, y) === 'vent' && !world.resolvedHazards.has(idx);
        }
    }

    // =========================================================================
    // 4. React Fiber 状态提取与安全弹窗交互
    // =========================================================================
    class GameStateAdapter {
        static autoCaptureFiberState() {
            const canvas = document.querySelector('canvas') || document.getElementById('root');
            if (!canvas) return false;

            const fiberKey = Object.keys(canvas).find((k) =>
                k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$') || k.startsWith('__reactContainer$')
            );
            if (!fiberKey) return false;

            let curr = canvas[fiberKey];
            let world = null;
            let session = null;
            let meta = null;
            let liveViewRef = null;
            const callbacks = [];

            while (curr) {
                let hook = curr.memoizedState;
                while (hook) {
                    const val = hook.memoizedState;

                    if (val && typeof val === 'object' && val.current) {
                        const target = val.current;
                        if (target.cols !== undefined && target.rows !== undefined && target.land && target.state) {
                            world = target;
                        } else if (target.player && target.status !== undefined) {
                            session = target;
                        } else if (target.zoom !== undefined && target.x !== undefined && target.y !== undefined) {
                            liveViewRef = target;
                        }
                    }

                    if (val && typeof val === 'object') {
                        const stateObj = Array.isArray(val) ? val[0] : val;
                        if (stateObj && stateObj.upgradeLevels !== undefined && stateObj.gold !== undefined) {
                            meta = stateObj;
                        }
                    }

                    if (typeof val === 'function') {
                        callbacks.push(val);
                    }
                    hook = hook.next;
                }

                if (world && liveViewRef) break;
                curr = curr.return;
            }

            if (world && liveViewRef) {
                unsafeWindow.__GAME = { world, session, meta, view: liveViewRef, callbacks };
                return true;
            }
            return false;
        }

        static getGameInstance() {
            this.autoCaptureFiberState();
            return unsafeWindow.__GAME || null;
        }

        static isReady() {
            const g = this.getGameInstance();
            return Boolean(g && g.world && g.view && g.session);
        }

        static resolveHealth(session) {
            if (!session) return { hp: 100, maxHp: 100, isLoaded: false, isSafe: true };
            let cur;
            let max;

            if (session.player) {
                cur = session.player.currentHealth ?? session.player.hp;
                max = session.player.finalStats?.maxHealth ?? session.player.baseStats?.maxHp ?? session.player.maxHp;
            }
            if (cur === undefined && session.hp !== undefined) {
                cur = session.hp;
                max = session.maxHp ?? cur;
            }

            cur = Number(cur);
            max = Number(max);

            if (Number.isNaN(cur) || Number.isNaN(max) || max <= 0) {
                return { hp: 100, maxHp: 100, isLoaded: false, isSafe: true };
            }

            const hp = Math.ceil(cur);
            const maxHp = Math.ceil(max);
            const isSafe = (hp / maxHp) >= CONFIG.SAFE_HP_RATIO_FOR_VENT && hp > 35;

            return { hp, maxHp, isLoaded: true, isSafe };
        }

        static triggerButtonClick(btn) {
            if (!btn) return;

            try {
                const reactPropsKey = Object.keys(btn).find((k) => k.startsWith('__reactProps'));
                if (reactPropsKey && typeof btn[reactPropsKey]?.onClick === 'function') {
                    btn[reactPropsKey].onClick({
                        preventDefault() {},
                        stopPropagation() {},
                        target: btn,
                        currentTarget: btn,
                    });
                }
            } catch (e) {
                // 忽略组件状态差异
            }

            try {
                const eventInit = { bubbles: true, cancelable: true, buttons: 1 };
                btn.dispatchEvent(new PointerEvent('pointerdown', eventInit));
                btn.dispatchEvent(new MouseEvent('mousedown', eventInit));
                btn.dispatchEvent(new PointerEvent('pointerup', { ...eventInit, buttons: 0 }));
                btn.dispatchEvent(new MouseEvent('mouseup', { ...eventInit, buttons: 0 }));
                btn.click();
            } catch (e) {
                btn.click();
            }
        }

        static handleModals(autoPick, onAction) {
            const session = unsafeWindow.__GAME?.session;
            const hasPendingModalState = Boolean(
                session?.pendingChest ||
                session?.pendingReward ||
                session?.pendingShrine ||
                session?.pendingGeoVictories?.length
            );

            const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
            let candidateBtn = null;

            // 1. 神殿最高优先级：强制点击 "Walk away" 离开避伤
            if (session?.pendingShrine) {
                for (const btn of buttons) {
                    if (btn.id?.includes('ai-btn')) continue;
                    const text = (btn.textContent || '').trim().toLowerCase();
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const combined = `${text} ${ariaLabel}`;
                    if (combined.includes('walk') || combined.includes('leave') || combined.includes('离开') || combined.includes('走开')) {
                        candidateBtn = btn;
                        break;
                    }
                }
            }

            // 2. 其它弹窗（宝箱、升级、通关）
            if (!candidateBtn) {
                for (const btn of buttons) {
                    if (btn.id?.includes('ai-btn')) continue;

                    const isVisible = btn.offsetWidth > 0 || btn.offsetHeight > 0 || btn.getClientRects().length > 0;
                    if (!isVisible) continue;

                    const text = (btn.textContent || '').trim().toLowerCase();
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const combined = `${text} ${ariaLabel}`;

                    const isKeywordMatch = CONFIG.MODAL_KEYWORDS.some((kw) => combined.includes(kw));
                    const isInsideModal = Boolean(btn.closest('div[class*="z-"]') || btn.closest('.hud-frame'));

                    if (isKeywordMatch || (hasPendingModalState && isInsideModal)) {
                        candidateBtn = btn;
                        break;
                    }
                }
            }

            if (candidateBtn) {
                if (autoPick || session?.pendingShrine) {
                    this.triggerButtonClick(candidateBtn);
                    if (typeof onAction === 'function') {
                        const actionName = candidateBtn.textContent.trim() || candidateBtn.getAttribute('aria-label') || 'Action';
                        onAction(actionName);
                    }
                    return false;
                }
                return true;
            }

            return hasPendingModalState;
        }
    }

    // =========================================================================
    // 5. 螺旋扩散与全图混合寻路器 (Turbo Spiral & Frontier Hunter)
    // =========================================================================
    class TurboSpiralPathfinder {
        constructor(world) {
            this.world = world;
            this.cols = world.cols;
            this.rows = world.rows;

            this.visitedBits = new Uint8Array(Math.ceil((this.cols * this.rows) / 8));
            this.interactQueue = new FastPointerQueue(); // [P0] 宝箱/喷口交互队列
            this.zeroQueue = new FastPointerQueue();     // [P1] 0 空白引爆格队列
            this.frontierQueue = new FastPointerQueue(); // [P2] 数字边界推图队列

            this.spiralRadius = 0;
            this.spiralMax = Math.max(this.cols, this.rows);
            this.initSeedPoint();
        }

        initSeedPoint() {
            const { safeX, safeY } = this.world;
            if (safeX >= 0 && safeY >= 0) {
                const idx = safeY * this.cols + safeX;
                this.markVisited(idx);
                this.addNeighbors(safeX, safeY, true);
            }
        }

        updateWorld(world) {
            if (this.world.seed !== world.seed || this.cols !== world.cols || this.rows !== world.rows) {
                this.world = world;
                this.cols = world.cols;
                this.rows = world.rows;
                this.visitedBits = new Uint8Array(Math.ceil((this.cols * this.rows) / 8));
                this.interactQueue.clear();
                this.zeroQueue.clear();
                this.frontierQueue.clear();
                this.spiralRadius = 0;
                this.initSeedPoint();
            } else {
                this.world = world;
            }
        }

        isVisited(idx) {
            return (this.visitedBits[idx >>> 3] & (1 << (idx & 7))) !== 0;
        }

        markVisited(idx) {
            this.visitedBits[idx >>> 3] |= (1 << (idx & 7));
        }

        addNeighbors(x, y, isHealthSafe) {
            const cols = this.cols;
            const rows = this.rows;

            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= rows) continue;

                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    if (nx < 0 || nx >= cols) continue;

                    const idx = ny * cols + nx;
                    if (this.isVisited(idx)) continue;
                    if (!FullOracleEngine.isLand(this.world, nx, ny)) continue;
                    if (FullOracleEngine.isMine(this.world, nx, ny)) continue;

                    const state = FullOracleEngine.getTileState(this.world, nx, ny);

                    // 1. 待收取的宝箱/喷口
                    if (FullOracleEngine.isPendingChest(this.world, nx, ny) || FullOracleEngine.isPendingVent(this.world, nx, ny, isHealthSafe)) {
                        this.markVisited(idx);
                        this.interactQueue.push({ x: nx, y: ny, idx });
                        continue;
                    }

                    // 2. 未翻开地块
                    if (state === CONFIG.TILE_STATE.UNOPENED) {
                        this.markVisited(idx);
                        const poi = FullOracleEngine.predictPoi(this.world, nx, ny);
                        if (poi === 'treasure') {
                            this.interactQueue.push({ x: nx, y: ny, idx });
                        } else {
                            const adjMines = FullOracleEngine.countAdjacentMines(this.world, nx, ny);
                            if (adjMines === 0) {
                                this.zeroQueue.push({ x: nx, y: ny, idx });
                            } else {
                                this.frontierQueue.push({ x: nx, y: ny, idx });
                            }
                        }
                    }
                }
            }
        }

        /**
         * 🌟 以出生点为中心向外螺旋扫描陆地（避免进入北极海洋死循环）
         */
        findNextSpiralTile() {
            const { cols, rows, safeX, safeY } = this.world;
            const centerX = safeX >= 0 ? safeX : (cols >> 1);
            const centerY = safeY >= 0 ? safeY : (rows >> 1);

            while (this.spiralRadius < this.spiralMax) {
                const r = this.spiralRadius;
                this.spiralRadius += 10; // 步长 10 快速外扩

                for (let dy = -r; dy <= r; dy += 4) {
                    const ny = centerY + dy;
                    if (ny < 0 || ny >= rows) continue;

                    for (let dx = -r; dx <= r; dx += 4) {
                        const nx = centerX + dx;
                        if (nx < 0 || nx >= cols) continue;

                        const idx = ny * cols + nx;
                        if (this.isVisited(idx)) continue;
                        if (!FullOracleEngine.isLand(this.world, nx, ny)) continue;
                        if (FullOracleEngine.isMine(this.world, nx, ny)) continue;

                        const state = FullOracleEngine.getTileState(this.world, nx, ny);
                        if (state === CONFIG.TILE_STATE.UNOPENED) {
                            this.markVisited(idx);
                            return { x: nx, y: ny, idx };
                        }
                    }
                }
            }

            // 全图兜底蒙特卡洛扫描
            for (let i = 0; i < CONFIG.MAX_RANDOM_SEARCH_ATTEMPTS; i++) {
                const rx = Math.floor(Math.random() * cols);
                const ry = Math.floor(Math.random() * rows);
                const idx = ry * cols + rx;

                if (
                    !this.isVisited(idx) &&
                    FullOracleEngine.isLand(this.world, rx, ry) &&
                    FullOracleEngine.getTileState(this.world, rx, ry) === CONFIG.TILE_STATE.UNOPENED &&
                    !FullOracleEngine.isMine(this.world, rx, ry)
                ) {
                    this.markVisited(idx);
                    return { x: rx, y: ry, idx };
                }
            }

            return null;
        }

        getNextMove(isHealthSafe) {
            // 1. 优先处理宝箱/喷口
            while (this.interactQueue.length > 0) {
                const target = this.interactQueue.shift();
                if (FullOracleEngine.isPendingChest(this.world, target.x, target.y)) return target;
                if (FullOracleEngine.isPendingVent(this.world, target.x, target.y, isHealthSafe)) return target;
                const state = FullOracleEngine.getTileState(this.world, target.x, target.y);
                if (state === CONFIG.TILE_STATE.UNOPENED && !FullOracleEngine.isMine(this.world, target.x, target.y)) {
                    return target;
                }
            }

            // 2. 优先引爆 0 空白格（一击翻开大片区域）
            while (this.zeroQueue.length > 0) {
                const target = this.zeroQueue.shift();
                const state = FullOracleEngine.getTileState(this.world, target.x, target.y);
                if (state === CONFIG.TILE_STATE.UNOPENED && !FullOracleEngine.isMine(this.world, target.x, target.y)) {
                    return target;
                } else if (state === CONFIG.TILE_STATE.REVEALED) {
                    this.addNeighbors(target.x, target.y, isHealthSafe);
                }
            }

            // 3. 数字边界格推图
            while (this.frontierQueue.length > 0) {
                const target = this.frontierQueue.shift();
                const state = FullOracleEngine.getTileState(this.world, target.x, target.y);
                if (state === CONFIG.TILE_STATE.UNOPENED && !FullOracleEngine.isMine(this.world, target.x, target.y)) {
                    return target;
                } else if (state === CONFIG.TILE_STATE.REVEALED) {
                    this.addNeighbors(target.x, target.y, isHealthSafe);
                }
            }

            // 4. 螺旋外扩找新陆地
            return this.findNextSpiralTile();
        }
    }

    // =========================================================================
    // 6. 输入合成调度器 (完全解离视口，精准命中目标中心)
    // =========================================================================
    class CanvasInputDispatcher {
        static dig(view, tileX, tileY) {
            const canvas = document.querySelector('canvas');
            if (!canvas) return;

            const reactPropsKey = Object.keys(canvas).find((k) => k.startsWith('__reactProps'));
            if (!reactPropsKey) return;

            const props = canvas[reactPropsKey];
            if (!props?.onPointerDown || !props?.onPointerUp) return;

            const rect = canvas.getBoundingClientRect();
            const targetClientX = rect.left + view.x + (tileX + 0.5) * view.zoom;
            const targetClientY = rect.top + view.y + (tileY + 0.5) * view.zoom;

            const evt = {
                button: 0,
                buttons: 1,
                pointerId: 1,
                clientX: targetClientX,
                clientY: targetClientY,
                pageX: targetClientX,
                pageY: targetClientY,
                target: canvas,
                currentTarget: canvas,
                preventDefault() {},
                stopPropagation() {},
            };

            try {
                props.onPointerDown(evt);
                props.onPointerUp({ ...evt, buttons: 0 });
            } catch (err) {
                console.error('[WorldSweeper] Dispatch error:', err);
            }
        }
    }

    // =========================================================================
    // 7. UI 控制面板层
    // =========================================================================
    class UIController {
        constructor({ onToggle, onAutoSkillChange }) {
            this.onToggle = onToggle;
            this.onAutoSkillChange = onAutoSkillChange;
            this.statusLabel = null;
            this.actionButton = null;
            this.lastUiUpdateTime = 0;
        }

        mount() {
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
                background: ${CONFIG.UI.BG_COLOR}; padding: 12px 16px; border-radius: 8px;
                border: 2px solid ${CONFIG.UI.THEME_COLOR}; font-family: monospace; color: ${CONFIG.UI.TEXT_COLOR};
                user-select: none; min-width: 175px; box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                pointer-events: auto !important;
            `;

            this.statusLabel = document.createElement('div');
            this.statusLabel.textContent = 'Status: Waiting for engine...';
            this.statusLabel.style.cssText = `font-size: 12px; margin-bottom: 8px; text-align: center; color: ${CONFIG.UI.THEME_COLOR};`;

            this.actionButton = document.createElement('button');
            this.actionButton.id = 'ai-btn';
            this.actionButton.textContent = 'Start';
            this.actionButton.disabled = true;
            this.actionButton.style.cssText = `
                background: #1a1808; color: ${CONFIG.UI.TEXT_COLOR}; border: 2px solid ${CONFIG.UI.THEME_COLOR};
                padding: 8px 16px; font-family: inherit; font-size: 12px; font-weight: bold;
                cursor: pointer; text-transform: uppercase; width: 100%; border-radius: 4px;
                pointer-events: auto !important;
            `;

            const handleInstant = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!this.actionButton.disabled) this.onToggle();
            };
            this.actionButton.addEventListener('pointerdown', handleInstant);
            this.actionButton.addEventListener('mousedown', handleInstant);

            const optLabel = document.createElement('label');
            optLabel.style.cssText = 'display: flex; align-items: center; justify-content: center; font-size: 11px; margin-top: 8px; cursor: pointer; color: #aaa;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.marginRight = '6px';
            checkbox.onchange = (e) => this.onAutoSkillChange(e.target.checked);

            optLabel.appendChild(checkbox);
            optLabel.appendChild(document.createTextNode('自动秒选技能/开宝箱'));

            const tip = document.createElement('div');
            tip.textContent = '快捷键: 空格 / ESC 紧急暂停';
            tip.style.cssText = 'font-size: 9px; color: #888; text-align: center; margin-top: 6px;';

            container.appendChild(this.statusLabel);
            container.appendChild(this.actionButton);
            container.appendChild(optLabel);
            container.appendChild(tip);
            document.body.appendChild(container);
        }

        setStatus(text, force = false) {
            const now = Date.now();
            if (force || now - this.lastUiUpdateTime >= CONFIG.UI_THROTTLE_MS) {
                if (this.statusLabel) this.statusLabel.textContent = `Status: ${text}`;
                this.lastUiUpdateTime = now;
            }
        }

        setRunningState(isRunning) {
            if (!this.actionButton) return;
            this.actionButton.textContent = isRunning ? 'Stop' : 'Start';
            this.actionButton.style.borderColor = isRunning ? CONFIG.UI.STOP_COLOR : CONFIG.UI.THEME_COLOR;
            this.actionButton.style.color = isRunning ? CONFIG.UI.STOP_COLOR : CONFIG.UI.TEXT_COLOR;
        }

        setReady() {
            if (this.actionButton) {
                this.actionButton.disabled = false;
                this.setStatus('Ready', true);
            }
        }
    }

    // =========================================================================
    // 8. 主控应用调度器 (WorldSweeperBot)
    // =========================================================================
    class WorldSweeperBot {
        constructor() {
            this.isRunning = false;
            this.autoPickSkills = false;
            this.tickerId = null;
            this.pathfinder = null;

            this.ui = new UIController({
                onToggle: () => this.toggle(),
                onAutoSkillChange: (val) => { this.autoPickSkills = val; },
            });
        }

        bootstrap() {
            this.ui.mount();
            this.bindShortcuts();
            this.waitForGameReady();
        }

        bindShortcuts() {
            window.addEventListener('keydown', (e) => {
                if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
                if (e.code === 'Space' || e.code === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.toggle();
                }
            }, true);
        }

        waitForGameReady() {
            const timer = setInterval(() => {
                if (GameStateAdapter.isReady()) {
                    clearInterval(timer);
                    this.ui.setReady();
                    console.info('[WorldSweeper] ✅ 螺旋极速扫雷引擎已就绪！');
                }
            }, CONFIG.READY_POLL_INTERVAL_MS);
        }

        toggle() {
            if (this.isRunning) this.stop();
            else this.start();
        }

        start() {
            if (this.isRunning) return;
            const g = GameStateAdapter.getGameInstance();
            if (!g || !g.world || !g.view) {
                this.ui.setStatus('❌ 缺少游戏数据', true);
                return;
            }

            this.isRunning = true;
            this.ui.setRunningState(true);
            this.pathfinder = new TurboSpiralPathfinder(g.world);

            if (this.tickerId) clearInterval(this.tickerId);
            this.tickerId = setInterval(() => this.tick(), CONFIG.TICK_INTERVAL_MS);
        }

        stop() {
            this.isRunning = false;
            if (this.tickerId) {
                clearInterval(this.tickerId);
                this.tickerId = null;
            }
            this.ui.setRunningState(false);
            this.ui.setStatus('Stopped', true);
        }

        tick() {
            if (!this.isRunning) return;

            const game = GameStateAdapter.getGameInstance();
            if (!game || !game.world || !game.view) return;

            const { world, session, view } = game;
            this.pathfinder.updateWorld(world);

            // 1. 弹窗与神殿自动处理 (神殿秒退避伤)
            const hasModal = GameStateAdapter.handleModals(this.autoPickSkills, (name) => {
                this.ui.setStatus(`🎁 自动处理: ${name}`, true);
            });
            if (hasModal) {
                this.ui.setStatus('⏸️ 发现奖励/升级！', true);
                return;
            }

            // 2. 生命值与存活检测
            const health = GameStateAdapter.resolveHealth(session);
            const status = session.status;
            this.ui.setStatus(`Revealed: ${world.revealedCount}`);

            if (status === 'dead' || (health.isLoaded && health.hp <= 0 && status !== 'exploring')) {
                this.ui.setStatus('❤️ 角色已阵亡', true);
                this.stop();
                return;
            }

            if (status === 'victory') {
                this.ui.setStatus('🎉 胜利通关！', true);
                this.stop();
                return;
            }

            // 🌟 处于洪水动画期间，显示状态并把控制权让给游戏渲染
            if (world.flood && world.flood.head < world.flood.tail) {
                this.ui.setStatus(`🌊 连锁轰炸中: ${world.revealedCount}`);
                return;
            }

            // 3. 螺旋高频连发
            for (let i = 0; i < CONFIG.MAX_DIGS_PER_TICK; i++) {
                if (!this.isRunning) break;

                const target = this.pathfinder.getNextMove(health.isSafe);
                if (!target) {
                    this.ui.setStatus('🎉 全球安全区清理完成！', true);
                    this.stop();
                    return;
                }

                CanvasInputDispatcher.dig(view, target.x, target.y);
                this.pathfinder.addNeighbors(target.x, target.y, health.isSafe);

                if (world.flood && world.flood.head < world.flood.tail) {
                    break;
                }
            }
        }
    }

    // =========================================================================
    // 9. 脚本挂载入口
    // =========================================================================
    const app = new WorldSweeperBot();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => app.bootstrap());
    } else {
        app.bootstrap();
    }
})();