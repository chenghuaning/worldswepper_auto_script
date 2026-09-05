// ==UserScript==
// @name         WorldSweeper (Pixel-Perfect Oracle & Treasure Hunter)
// @namespace    https://github.com/chenghuaning/worldswepper_auto_script
// @version      29.0.0
// @description  全知透视扫雷：内置 React Fiber 自动状态捕获（免 DevTools）、原生数学避雷、宝箱/金币秒抢、ESC/空格急停。
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
        [BIOMES.OCEAN]: { ventMult: 0, shrineMult: 0, blightMult: 0, chestMult: 0 },
        [BIOMES.COAST]: { ventMult: 0.8, shrineMult: 1, blightMult: 0.4, chestMult: 1 },
        [BIOMES.FOREST]: { ventMult: 1, shrineMult: 1, blightMult: 1.8, chestMult: 1.2 },
        [BIOMES.GRASSLAND]: { ventMult: 1, shrineMult: 1, blightMult: 1, chestMult: 1 },
        [BIOMES.DESERT]: { ventMult: 2, shrineMult: 1, blightMult: 0.3, chestMult: 1 },
        [BIOMES.MOUNTAIN]: { ventMult: 1, shrineMult: 2, blightMult: 1, chestMult: 1 },
        [BIOMES.TUNDRA]: { ventMult: 0.5, shrineMult: 1, blightMult: 0.8, chestMult: 1 },
        [BIOMES.TROPICAL]: { ventMult: 1.4, shrineMult: 1, blightMult: 1.6, chestMult: 1 },
        [BIOMES.ROCKY]: { ventMult: 1.6, shrineMult: 1, blightMult: 1.3, chestMult: 1 },
        [BIOMES.VOLCANIC]: { ventMult: 2.4, shrineMult: 1, blightMult: 1.5, chestMult: 1 },
        [BIOMES.ICE]: { ventMult: 0.2, shrineMult: 1.8, blightMult: 1.1, chestMult: 1 },
        [BIOMES.URBAN]: { ventMult: 1, shrineMult: 1.5, blightMult: 0.5, chestMult: 1.6 },
    });

    const CONFIG = Object.freeze({
        TICK_INTERVAL_MS: 50,
        UI_THROTTLE_MS: 200,
        READY_POLL_INTERVAL_MS: 400,
        DEFAULT_DIG_ZOOM: 16.0,
        MAX_RANDOM_SEARCH_ATTEMPTS: 50000,
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
        PRIORITY: {
            INTERACTABLE: 4,
            CHEST: 3,
            GOLD_VENT: 2,
            SHRINE_BLIGHT: 1,
            NORMAL: 0,
        },
        MODAL_KEYWORDS: ['choose', 'take', 'select', '确认', '选择', 'claim', 'pay', 'open', 'vent', 'seal', 'bargain'],
        UI: {
            THEME_COLOR: '#7ec8dc',
            STOP_COLOR: '#ff7b72',
            BG_COLOR: 'rgba(0, 0, 0, 0.92)',
            TEXT_COLOR: '#f4f0e4',
        },
    });

    // =========================================================================
    // 2. 逆向推演与全知预测引擎 (Oracle Engine)
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
            if (x < 0 || y < 0 || x >= world.cols || y >= world.rows) return false;
            const idx = y * world.cols + x;
            return (world.land[idx >>> 3] & (1 << (idx & 7))) !== 0;
        }

        static getTileState(world, x, y) {
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

        static isInteractable(world, x, y) {
            if (this.getTileState(world, x, y) !== CONFIG.TILE_STATE.REVEALED) return false;
            const idx = y * world.cols + x;
            const poi = this.predictPoi(world, x, y);
            if (!poi) return false;
            return poi === 'treasure' ? !world.openedChests.has(idx) : !world.resolvedHazards.has(idx);
        }
    }

    // =========================================================================
    // 3. React Fiber 全自动捕获与状态适配器 (Auto Fiber Extractor)
    // =========================================================================
    class GameStateAdapter {
        /**
         * 通过 Canvas 向上回溯 React 19 Fiber 树，自动提取游戏内部状态
         * @returns {boolean}
         */
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
            let view = null;
            const callbacks = [];

            while (curr) {
                let hook = curr.memoizedState;
                while (hook) {
                    const val = hook.memoizedState;
                    const candidates = [val, val?.current, Array.isArray(val) ? val[0] : null];

                    for (const item of candidates) {
                        if (!item || typeof item !== 'object') continue;

                        if (item.cols !== undefined && item.rows !== undefined && item.land && item.state) {
                            world = item;
                        } else if (item.player && item.status !== undefined) {
                            session = item;
                        } else if (item.currentHealth !== undefined || (item.hp !== undefined && item.maxHp !== undefined)) {
                            session = item;
                        } else if (item.upgradeLevels !== undefined && item.gold !== undefined) {
                            meta = item;
                        } else if (item.zoom !== undefined && item.x !== undefined && item.y !== undefined) {
                            view = item;
                        }
                    }

                    if (typeof val === 'function') {
                        callbacks.push(val);
                    }
                    hook = hook.next;
                }

                if (world && view) break;
                curr = curr.return;
            }

            if (world && view) {
                unsafeWindow.__GAME = { world, session, meta, view, callbacks };
                return true;
            }
            return false;
        }

        static getGameInstance() {
            if (!unsafeWindow.__GAME || !unsafeWindow.__GAME.world) {
                this.autoCaptureFiberState();
            }
            return unsafeWindow.__GAME || null;
        }

        static isReady() {
            const g = this.getGameInstance();
            return Boolean(g && g.world && g.view && g.session);
        }

        static resolveHealth(session) {
            if (!session) return { hp: 100, maxHp: 100, isLoaded: false };
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
                return { hp: 100, maxHp: 100, isLoaded: false };
            }
            return { hp: Math.ceil(cur), maxHp: Math.ceil(max), isLoaded: true };
        }

        static handleModals(autoPick, onAction) {
            const buttons = document.querySelectorAll('button:not([disabled])');
            for (const btn of buttons) {
                const text = btn.textContent.trim().toLowerCase();
                const matched = CONFIG.MODAL_KEYWORDS.some((kw) => text.includes(kw));
                if (matched && btn.offsetParent !== null && !btn.id.includes('ai-btn')) {
                    if (autoPick) {
                        btn.click();
                        if (typeof onAction === 'function') {
                            onAction(btn.textContent.trim());
                        }
                        return false;
                    }
                    return true;
                }
            }
            return false;
        }
    }

    // =========================================================================
    // 4. 智能多优先级寻路器
    // =========================================================================
    class SmartPriorityPathfinder {
        constructor(world) {
            this.world = world;
            this.queues = {
                [CONFIG.PRIORITY.INTERACTABLE]: [],
                [CONFIG.PRIORITY.CHEST]: [],
                [CONFIG.PRIORITY.GOLD_VENT]: [],
                [CONFIG.PRIORITY.SHRINE_BLIGHT]: [],
                [CONFIG.PRIORITY.NORMAL]: [],
            };
            this.visited = new Set();
        }

        addNeighbors(x, y) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    const key = `${nx},${ny}`;

                    if (!FullOracleEngine.isLand(this.world, nx, ny) || this.visited.has(key)) continue;
                    if (FullOracleEngine.isMine(this.world, nx, ny)) continue;

                    const state = FullOracleEngine.getTileState(this.world, nx, ny);

                    if (state === CONFIG.TILE_STATE.REVEALED && FullOracleEngine.isInteractable(this.world, nx, ny)) {
                        this.visited.add(key);
                        this.queues[CONFIG.PRIORITY.INTERACTABLE].push({ x: nx, y: ny });
                        continue;
                    }

                    if (state === CONFIG.TILE_STATE.UNOPENED) {
                        this.visited.add(key);
                        const poi = FullOracleEngine.predictPoi(this.world, nx, ny);
                        if (poi === 'treasure') {
                            this.queues[CONFIG.PRIORITY.CHEST].push({ x: nx, y: ny });
                        } else if (poi === 'vent') {
                            this.queues[CONFIG.PRIORITY.GOLD_VENT].push({ x: nx, y: ny });
                        } else if (poi === 'shrine' || poi === 'blight') {
                            this.queues[CONFIG.PRIORITY.SHRINE_BLIGHT].push({ x: nx, y: ny });
                        } else {
                            this.queues[CONFIG.PRIORITY.NORMAL].push({ x: nx, y: ny });
                        }
                    }
                }
            }
        }

        findGlobalSafeTile() {
            const { cols, rows, safeX, safeY } = this.world;

            if (safeX >= 0 && safeY >= 0) {
                for (let r = 0; r < 80; r++) {
                    for (let dy = -r; dy <= r; dy++) {
                        for (let dx = -r; dx <= r; dx++) {
                            const nx = safeX + dx;
                            const ny = safeY + dy;
                            const key = `${nx},${ny}`;
                            if (
                                FullOracleEngine.isLand(this.world, nx, ny) &&
                                FullOracleEngine.getTileState(this.world, nx, ny) === CONFIG.TILE_STATE.UNOPENED &&
                                !this.visited.has(key) &&
                                !FullOracleEngine.isMine(this.world, nx, ny)
                            ) {
                                return { x: nx, y: ny };
                            }
                        }
                    }
                }
            }

            for (let i = 0; i < CONFIG.MAX_RANDOM_SEARCH_ATTEMPTS; i++) {
                const rx = Math.floor(Math.random() * cols);
                const ry = Math.floor(Math.random() * rows);
                const key = `${rx},${ry}`;
                if (
                    FullOracleEngine.isLand(this.world, rx, ry) &&
                    FullOracleEngine.getTileState(this.world, rx, ry) === CONFIG.TILE_STATE.UNOPENED &&
                    !this.visited.has(key) &&
                    !FullOracleEngine.isMine(this.world, rx, ry)
                ) {
                    return { x: rx, y: ry };
                }
            }
            return null;
        }

        getNextMove() {
            const priorityOrder = [
                CONFIG.PRIORITY.INTERACTABLE,
                CONFIG.PRIORITY.CHEST,
                CONFIG.PRIORITY.GOLD_VENT,
                CONFIG.PRIORITY.SHRINE_BLIGHT,
                CONFIG.PRIORITY.NORMAL,
            ];

            for (const p of priorityOrder) {
                const q = this.queues[p];
                while (q.length > 0) {
                    const target = q.shift();
                    const state = FullOracleEngine.getTileState(this.world, target.x, target.y);

                    if (p === CONFIG.PRIORITY.INTERACTABLE) {
                        if (FullOracleEngine.isInteractable(this.world, target.x, target.y)) return target;
                    } else if (state === CONFIG.TILE_STATE.UNOPENED && !FullOracleEngine.isMine(this.world, target.x, target.y)) {
                        return target;
                    }
                }
            }

            const fallback = this.findGlobalSafeTile();
            if (fallback) {
                this.visited.add(`${fallback.x},${fallback.y}`);
                return fallback;
            }
            return null;
        }
    }

    // =========================================================================
    // 5. 输入合成调度器
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
            view.zoom = CONFIG.DEFAULT_DIG_ZOOM;
            view.x = rect.width / 2 - (tileX + 0.5) * CONFIG.DEFAULT_DIG_ZOOM;
            view.y = rect.height / 2 - (tileY + 0.5) * CONFIG.DEFAULT_DIG_ZOOM;

            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            const evt = {
                button: 0,
                buttons: 1,
                pointerId: 1,
                clientX: cx,
                clientY: cy,
                pageX: cx,
                pageY: cy,
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
    // 6. UI 控制面板层
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
            this.statusLabel.textContent = 'Status: Waiting...';
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
    // 7. 主控应用调度器
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
                    console.info('[WorldSweeper] ✅ React Fiber 已自动挂载就绪！(按 ESC/空格 随时启停)');
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
            this.pathfinder = new SmartPriorityPathfinder(g.world);

            if (this.tickerId) clearInterval(this.tickerId);
            this.tickerId = setInterval(() => this.tick(g), CONFIG.TICK_INTERVAL_MS);
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

        tick(game) {
            if (!this.isRunning) return;

            const { world, session, view } = game;

            // 1. 弹窗交互检测
            const hasModal = GameStateAdapter.handleModals(this.autoPickSkills, (name) => {
                this.ui.setStatus(`🎁 自动交互: ${name}`, true);
            });
            if (hasModal) {
                this.ui.setStatus('⏸️ 发现奖励/升级！', true);
                return;
            }

            // 2. 生命值与结算状态安全检测
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

            // 3. 优先级寻路与执行
            const target = this.pathfinder.getNextMove();
            if (!target) {
                this.ui.setStatus('🎉 全图安全区清理完成！', true);
                this.stop();
                return;
            }

            CanvasInputDispatcher.dig(view, target.x, target.y);
            this.pathfinder.addNeighbors(target.x, target.y);
        }
    }

    // =========================================================================
    // 8. 脚本挂载入口
    // =========================================================================
    const app = new WorldSweeperBot();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => app.bootstrap());
    } else {
        app.bootstrap();
    }
})();