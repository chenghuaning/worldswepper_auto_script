// ==UserScript==
// @name         WorldSweeper (Pixel-Perfect Oracle & Treasure Hunter - WebGPU GPGPU v45)
// @namespace    https://github.com/chenghuaning/worldswepper_auto_script
// @version      45.0.0
// @description  全知透视扫雷
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
    // 1. 地形与生物群系常量配置
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
        GPU_BATCH_SIZE: 150000,        // 🌟 单次 GPU 并发调度的地块规模 (15万格/批次)
        UI_THROTTLE_MS: 150,           // UI 渲染节流
        SPEED_SAMPLE_INTERVAL_MS: 400, // 速率采样周期
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
            SPEED_COLOR: '#e0c060',
            BG_COLOR: 'rgba(0, 0, 0, 0.92)',
            TEXT_COLOR: '#f4f0e4',
        },
    });

    // =========================================================================
    // 2. WebGPU 计算着色器源码 (WGSL - GPU 硬件底层并发指令)
    // =========================================================================
    const WGSL_SHADER_CODE = /* wgsl */`
    struct Params {
        cols: u32,
        rows: u32,
        seed: u32,
        densityU32: u32,
        chestSalt: u32,
        startIndex: u32,
        batchCount: u32,
        safeX: i32,
        safeY: i32,
    };

    @group(0) @binding(0) var<storage, read> land: array<u32>;
    @group(0) @binding(1) var<storage, read_write> state: array<atomic<u32>>;
    @group(0) @binding(2) var<uniform> params: Params;
    @group(0) @binding(3) var<storage, read_write> outStats: array<atomic<u32>>;
    // outStats[0]: revealedCount, outStats[1]: chestFoundFlag, outStats[2]: chestX, outStats[3]: chestY

    fn hashU32(val: u32) -> u32 {
        var t = val;
        t = (t ^ (t >> 16u)) * 2146121005u;
        t = (t ^ (t >> 15u)) * 2221713035u;
        return t ^ (t >> 16u);
    }

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let localIdx = global_id.x;
        if (localIdx >= params.batchCount) { return; }

        let idx = params.startIndex + localIdx;
        let totalTiles = params.cols * params.rows;
        if (idx >= totalTiles) { return; }

        // 1. 检查是否为陆地 (land array 以 32-bit u32 存储)
        let landU32Idx = idx >> 5u;
        let bitPos = idx & 31u;
        if ((land[landU32Idx] & (1u << bitPos)) == 0u) {
            return; // 海洋，跳过
        }

        // 2. 检查是否未翻开 (state 每格 2 bits，每 u32 存 16 格)
        let stateU32Idx = idx >> 4u;
        let shift = (idx & 15u) * 2u;
        let curState = (atomicLoad(&state[stateU32Idx]) >> shift) & 3u;
        if (curState != 0u) {
            return; // 已翻开或已插旗，跳过
        }

        let x = idx % params.cols;
        let y = idx / params.cols;

        // 3. 出生点保护区
        if (params.safeX >= 0) {
            let dx = abs(i32(x) - params.safeX);
            let dy = abs(i32(y) - params.safeY);
            if (max(dx, dy) <= 1) {
                return;
            }
        }

        // 4. 地雷哈希推演
        let hx = hashU32(x + 1u);
        let hy = hashU32((y + 1u) * 374761393u);
        if (hashU32(hx ^ hy ^ params.seed) < params.densityU32) {
            return; // 是雷，绝对避开
        }

        // 5. 宝箱判定
        let htx = hashU32(x + 17u);
        let hty = hashU32((y + 31u) * 668265263u);
        if (hashU32(htx ^ hty ^ params.chestSalt) < 25769803u) {
            atomicStore(&outStats[1], 1u);
            atomicStore(&outStats[2], x);
            atomicStore(&outStats[3], y);
            return;
        }

        // 6. 原子置位写入 state 为 REVEALED (2)
        let revealMask = 2u << shift;
        atomicOr(&state[stateU32Idx], revealMask);
        atomicAdd(&outStats[0], 1u);
    }
    `;

    // =========================================================================
    // 3. WebGPU 硬件加速控制器 (WebGPU Compute Engine)
    // =========================================================================
    class WebGPUSweeperEngine {
        constructor(world) {
            this.world = world;
            this.cols = world.cols;
            this.rows = world.rows;
            this.totalTiles = this.cols * this.rows;
            this.seed = world.seed;
            this.cursorIndex = 0;
            this.chestSalt = world.seed ^ 2779096485;

            this.isGpuReady = false;
            this.device = null;
            this.pipeline = null;
            this.landBuffer = null;
            this.stateBuffer = null;
            this.paramsBuffer = null;
            this.statsBuffer = null;
            this.readbackStatsBuffer = null;
            this.bindGroup = null;

            // CPU 预查表备用 (降级通道)
            this.hxTable = new Uint32Array(this.cols + 2);
            this.htxTable = new Uint32Array(this.cols + 20);
            for (let x = 0; x < this.cols; x++) {
                this.hxTable[x] = FullOracleEngine.hashU32(x + 1);
                this.htxTable[x] = FullOracleEngine.hashU32(x + 17);
            }

            this.initWebGPU();
        }

        async initWebGPU() {
            if (!navigator.gpu) {
                console.warn('[WorldSweeper] 浏览器未开启 WebGPU，已自动切换至 CPU 超频流水线模式');
                return;
            }

            try {
                const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
                if (!adapter) return;

                this.device = await adapter.requestDevice();
                const shaderModule = this.device.createShaderModule({ code: WGSL_SHADER_CODE });

                this.pipeline = this.device.createComputePipeline({
                    layout: 'auto',
                    compute: { module: shaderModule, entryPoint: 'main' },
                });

                // 创建显存缓冲区 (VRAM Buffers)
                const landU32 = new Uint32Array(this.world.land.buffer, this.world.land.byteOffset, this.world.land.byteLength >>> 2);
                this.landBuffer = this.device.createBuffer({
                    size: landU32.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                this.device.queue.writeBuffer(this.landBuffer, 0, landU32);

                this.stateBuffer = this.device.createBuffer({
                    size: this.world.state.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
                });
                this.device.queue.writeBuffer(this.stateBuffer, 0, this.world.state);

                this.paramsBuffer = this.device.createBuffer({
                    size: 36, // 9 * 4 bytes
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });

                this.statsBuffer = this.device.createBuffer({
                    size: 16, // 4 * 4 bytes
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
                });

                this.readbackStatsBuffer = this.device.createBuffer({
                    size: 16,
                    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
                });

                this.bindGroup = this.device.createBindGroup({
                    layout: this.pipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: { buffer: this.landBuffer } },
                        { binding: 1, resource: { buffer: this.stateBuffer } },
                        { binding: 2, resource: { buffer: this.paramsBuffer } },
                        { binding: 3, resource: { buffer: this.statsBuffer } },
                    ],
                });

                this.isGpuReady = true;
                console.info('[WorldSweeper] 🎮 AMD/Intel 显卡 WebGPU 计算着色器已成功挂载！');
            } catch (err) {
                console.warn('[WorldSweeper] WebGPU 初始化异常，切回 CPU 流水线:', err);
                this.isGpuReady = false;
            }
        }

        updateWorld(world) {
            if (this.world.seed !== world.seed || this.cols !== world.cols || this.rows !== world.rows) {
                this.world = world;
                this.cols = world.cols;
                this.rows = world.rows;
                this.totalTiles = this.cols * this.rows;
                this.cursorIndex = 0;
                this.chestSalt = world.seed ^ 2779096485;
                if (this.isGpuReady) this.initWebGPU();
            } else {
                this.world = world;
            }
        }

        /**
         * 🌟 显卡 GPU 并发计算批次
         */
        async sweepGpuBatch(session) {
            if (!this.isGpuReady || !this.device) {
                return this.sweepCpuFallback(session);
            }

            const batchSize = CONFIG.GPU_BATCH_SIZE;
            const startIndex = this.cursorIndex;

            // 1. 写入 Uniform 参数到显存
            const paramsData = new Uint32Array([
                this.cols,
                this.rows,
                this.world.seed,
                this.world.densityU32,
                this.chestSalt,
                startIndex,
                batchSize,
                this.world.safeX,
                this.world.safeY,
            ]);
            this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsData);
            this.device.queue.writeBuffer(this.statsBuffer, 0, new Uint32Array(4)); // 重置计数器

            // 2. 调度计算通道 (Dispatch Compute Shader)
            const commandEncoder = this.device.createCommandEncoder();
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(this.pipeline);
            passEncoder.setBindGroup(0, this.bindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(batchSize / 256));
            passEncoder.end();

            // 复制统计结果到可读缓冲区
            commandEncoder.copyBufferToBuffer(this.statsBuffer, 0, this.readbackStatsBuffer, 0, 16);
            this.device.queue.submit([commandEncoder.finish()]);

            // 3. 回读 GPU 统计结果
            await this.readbackStatsBuffer.mapAsync(GPUMapMode.READ);
            const stats = new Uint32Array(this.readbackStatsBuffer.getMappedRange().slice(0));
            this.readbackStatsBuffer.unmap();

            const revealedInBatch = stats[0];
            const chestFound = stats[1] === 1;
            const chestX = stats[2];
            const chestY = stats[3];

            // 更新状态
            this.world.revealedCount += revealedInBatch;
            this.world.remainingSafe -= revealedInBatch;
            if (session?.progress) {
                session.progress.tilesRevealed += revealedInBatch;
                session.progress.safeTilesRevealed += revealedInBatch;
            }
            if (session?.player) {
                const xpMult = (session.player.finalStats?.xpMultiplier ?? 1) * 2;
                session.player.actionXp += revealedInBatch * xpMult;
                session.player.xp += revealedInBatch * xpMult;
            }

            this.cursorIndex += batchSize;
            if (this.cursorIndex >= this.totalTiles) {
                this.cursorIndex = 0;
            }

            if (chestFound && !this.world.openedChests.has(chestY * this.cols + chestX)) {
                return { encounterChest: { x: chestX, y: chestY } };
            }

            return null;
        }

        /**
         * CPU 降级超频备用通道
         */
        sweepCpuFallback(session) {
            const world = this.world;
            const land = world.land;
            const state = world.state;
            const seed = this.seed;
            const densityU32 = world.densityU32;
            const cols = this.cols;
            const total = this.totalTiles;
            const chestSalt = this.chestSalt;
            const hxTable = this.hxTable;
            const htxTable = this.htxTable;

            const player = session?.player;
            const xpAdd = (player?.finalStats?.xpMultiplier ?? 1) * 2;
            let batchCount = 0;
            const maxTiles = 30000;

            const fastHash = (e) => {
                let t = e | 0;
                t = Math.imul(t ^ (t >>> 16), 2146121005);
                t = Math.imul(t ^ (t >>> 15), 2221713035);
                return ((t ^ (t >>> 16)) >>> 0);
            };

            let idx = this.cursorIndex;
            let x = idx % cols;
            let y = (idx / cols) | 0;
            let cachedY = -1;
            let currHy = 0;
            let currHty = 0;

            while (batchCount < maxTiles) {
                if (y !== cachedY) {
                    cachedY = y;
                    currHy = fastHash(Math.imul(y + 1, 374761393));
                    currHty = fastHash(Math.imul(y + 31, 668265263));
                }

                const curIdx = idx;
                const curX = x;
                const curY = y;

                idx++;
                x++;
                if (x === cols) { x = 0; y++; }
                if (idx >= total) { idx = 0; x = 0; y = 0; }

                const bytePos = curIdx >>> 3;
                if (!(land[bytePos] & (1 << (curIdx & 7)))) continue;

                const stateByte = curIdx >>> 2;
                const shift = (curIdx & 3) << 1;
                if (((state[stateByte] >> shift) & 3) !== 0) continue;

                if (world.seeded && world.safeX >= 0) {
                    if (Math.max(Math.abs(curX - world.safeX), Math.abs(curY - world.safeY)) <= 1) continue;
                }

                const hx = hxTable[curX];
                if (fastHash(hx ^ currHy ^ seed) < densityU32) continue;

                const htx = htxTable[curX];
                const isChest = fastHash(htx ^ currHty ^ chestSalt) < 25769803;
                if (isChest && !world.openedChests.has(curIdx)) {
                    this.cursorIndex = idx;
                    return { encounterChest: { x: curX, y: curY } };
                }

                state[stateByte] = (state[stateByte] & ~(3 << shift)) | (2 << shift);
                world.revealedCount++;
                world.remainingSafe--;
                batchCount++;

                if (player) {
                    player.actionXp += xpAdd;
                    player.xp += xpAdd;
                }
            }

            this.cursorIndex = idx;
            if (session?.progress && batchCount > 0) {
                session.progress.tilesRevealed += batchCount;
                session.progress.safeTilesRevealed += batchCount;
            }
            return null;
        }
    }

    // =========================================================================
    // 4. 辅助推演工具
    // =========================================================================
    class FullOracleEngine {
        static hashU32(e) {
            let t = e | 0;
            t = Math.imul(t ^ (t >>> 16), 2146121005);
            t = Math.imul(t ^ (t >>> 15), 2221713035);
            return ((t ^ (t >>> 16)) >>> 0);
        }
    }

    // =========================================================================
    // 5. React Fiber 状态提取与安全弹窗交互
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
                // ignore
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

        static handleModals(autoPick, autoKeepPlaying, onAction) {
            const session = unsafeWindow.__GAME?.session;
            const hasPendingModalState = Boolean(
                session?.pendingChest ||
                session?.pendingReward ||
                session?.pendingShrine ||
                session?.pendingGeoVictories?.length
            );

            const buttons = Array.from(document.querySelectorAll('button:not([disabled])'));
            let candidateBtn = null;
            let isKeepPlayingBtn = false;

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

            if (!candidateBtn && session?.pendingGeoVictories?.length) {
                for (const btn of buttons) {
                    if (btn.id?.includes('ai-btn')) continue;
                    const text = (btn.textContent || '').trim().toLowerCase();
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const combined = `${text} ${ariaLabel}`;
                    if (combined.includes('keep playing') || combined.includes('继续')) {
                        candidateBtn = btn;
                        isKeepPlayingBtn = true;
                        break;
                    }
                }
            }

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
                const shouldClick = session?.pendingShrine || (isKeepPlayingBtn ? autoKeepPlaying : autoPick);
                if (shouldClick) {
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
    // 6. 输入模拟代理
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
        constructor({ onToggle, onAutoSkillChange, onAntiFlashChange, onAutoKeepPlayingChange }) {
            this.onToggle = onToggle;
            this.onAutoSkillChange = onAutoSkillChange;
            this.onAntiFlashChange = onAntiFlashChange;
            this.onAutoKeepPlayingChange = onAutoKeepPlayingChange;

            this.speedLabel = null;
            this.statusLabel = null;
            this.actionButton = null;
            this.antiFlashStyleTag = null;
            this.lastUiUpdateTime = 0;
        }

        mount() {
            const container = document.createElement('div');
            container.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
                background: ${CONFIG.UI.BG_COLOR}; padding: 12px 16px; border-radius: 8px;
                border: 2px solid ${CONFIG.UI.THEME_COLOR}; font-family: monospace; color: ${CONFIG.UI.TEXT_COLOR};
                user-select: none; min-width: 215px; box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                pointer-events: auto !important;
            `;

            this.speedLabel = document.createElement('div');
            this.speedLabel.textContent = '⚡ 速率: 0 格/秒';
            this.speedLabel.style.cssText = `font-size: 13px; font-weight: bold; margin-bottom: 4px; text-align: center; color: ${CONFIG.UI.SPEED_COLOR};`;

            this.statusLabel = document.createElement('div');
            this.statusLabel.textContent = 'Status: Waiting...';
            this.statusLabel.style.cssText = `font-size: 11px; margin-bottom: 8px; text-align: center; color: ${CONFIG.UI.THEME_COLOR};`;

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
            optLabel.style.cssText = 'display: flex; align-items: center; justify-content: flex-start; font-size: 11px; margin-top: 8px; cursor: pointer; color: #aaa;';
            const autoSkillCheckbox = document.createElement('input');
            autoSkillCheckbox.type = 'checkbox';
            autoSkillCheckbox.style.marginRight = '6px';
            autoSkillCheckbox.onchange = (e) => this.onAutoSkillChange(e.target.checked);
            optLabel.appendChild(autoSkillCheckbox);
            optLabel.appendChild(document.createTextNode('自动秒选技能/开宝箱'));

            const conquestLabel = document.createElement('label');
            conquestLabel.style.cssText = 'display: flex; align-items: center; justify-content: flex-start; font-size: 11px; margin-top: 6px; cursor: pointer; color: #7ec8dc;';
            const conquestCheckbox = document.createElement('input');
            conquestCheckbox.type = 'checkbox';
            conquestCheckbox.checked = true;
            conquestCheckbox.style.marginRight = '6px';
            conquestCheckbox.onchange = (e) => this.onAutoKeepPlayingChange(e.target.checked);
            conquestLabel.appendChild(conquestCheckbox);
            conquestLabel.appendChild(document.createTextNode('自动继续征服 (弹窗秒退)'));

            const flashLabel = document.createElement('label');
            flashLabel.style.cssText = 'display: flex; align-items: center; justify-content: flex-start; font-size: 11px; margin-top: 6px; cursor: pointer; color: #e0c060;';
            const flashCheckbox = document.createElement('input');
            flashCheckbox.type = 'checkbox';
            flashCheckbox.checked = true;
            flashCheckbox.style.marginRight = '6px';
            flashCheckbox.onchange = (e) => this.setAntiFlashEnabled(e.target.checked);
            flashLabel.appendChild(flashCheckbox);
            flashLabel.appendChild(document.createTextNode('屏蔽升级黄光闪烁'));

            const tip = document.createElement('div');
            tip.textContent = '快捷键: 空格 / ESC 紧急暂停';
            tip.style.cssText = 'font-size: 9px; color: #888; text-align: center; margin-top: 6px;';

            container.appendChild(this.speedLabel);
            container.appendChild(this.statusLabel);
            container.appendChild(this.actionButton);
            container.appendChild(optLabel);
            container.appendChild(conquestLabel);
            container.appendChild(flashLabel);
            container.appendChild(tip);
            document.body.appendChild(container);

            this.setAntiFlashEnabled(true);
        }

        setAntiFlashEnabled(enabled) {
            if (enabled) {
                if (!this.antiFlashStyleTag) {
                    this.antiFlashStyleTag = document.createElement('style');
                    this.antiFlashStyleTag.id = 'ws-anti-flash-style';
                    this.antiFlashStyleTag.textContent = `
                        .hud-flash-level {
                            display: none !important;
                            opacity: 0 !important;
                            visibility: hidden !important;
                            animation: none !important;
                        }
                    `;
                    document.head.appendChild(this.antiFlashStyleTag);
                }
            } else if (this.antiFlashStyleTag) {
                this.antiFlashStyleTag.remove();
                this.antiFlashStyleTag = null;
            }
            this.onAntiFlashChange?.(enabled);
        }

        setSpeed(tps) {
            if (this.speedLabel) {
                this.speedLabel.textContent = `⚡ 速率: ${tps.toLocaleString()} 格/秒`;
            }
        }

        setStatus(text, force = false) {
            const now = Date.now();
            if (force || now - this.lastUiUpdateTime >= CONFIG.UI_THROTTLE_MS) {
                if (this.statusLabel) this.statusLabel.textContent = text;
                this.lastUiUpdateTime = now;
            }
        }

        setRunningState(isRunning) {
            if (!this.actionButton) return;
            this.actionButton.textContent = isRunning ? 'Stop' : 'Start';
            this.actionButton.style.borderColor = isRunning ? CONFIG.UI.STOP_COLOR : CONFIG.UI.THEME_COLOR;
            this.actionButton.style.color = isRunning ? CONFIG.UI.STOP_COLOR : CONFIG.UI.TEXT_COLOR;
            if (!isRunning) this.setSpeed(0);
        }

        setReady() {
            if (this.actionButton) {
                this.actionButton.disabled = false;
                this.setStatus('Status: Ready', true);
            }
        }
    }

    // =========================================================================
    // 8. 主控应用调度器 (WebGPU 异步流水线)
    // =========================================================================
    class WorldSweeperBot {
        constructor() {
            this.isRunning = false;
            this.isComputing = false;
            this.autoPickSkills = false;
            this.autoKeepPlaying = true;
            this.engine = null;
            this.isModalActive = false;

            this.speedSampleTime = 0;
            this.speedSampleCount = 0;
            this.currentTps = 0;

            this.channel = new MessageChannel();
            this.channel.port1.onmessage = async () => {
                if (!this.isRunning || this.isModalActive || this.isComputing) return;
                this.isComputing = true;
                await this.processGpuWork();
                this.isComputing = false;
                if (this.isRunning && !this.isModalActive) {
                    this.channel.port2.postMessage(null);
                }
            };

            this.ui = new UIController({
                onToggle: () => this.toggle(),
                onAutoSkillChange: (val) => { this.autoPickSkills = val; },
                onAntiFlashChange: () => {},
                onAutoKeepPlayingChange: (val) => { this.autoKeepPlaying = val; },
            });
        }

        bootstrap() {
            this.ui.mount();
            this.bindShortcuts();
            this.waitForGameReady();
            this.startUiAndModalLoop();
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
                    console.info('[WorldSweeper] ✅ WebGPU GPGPU 显卡引擎已就绪！');
                }
            }, 400);
        }

        startUiAndModalLoop() {
            const renderTick = () => {
                if (this.isRunning) {
                    const game = GameStateAdapter.getGameInstance();
                    if (game && game.world) {
                        const hasModal = GameStateAdapter.handleModals(this.autoPickSkills, this.autoKeepPlaying, (name) => {
                            this.ui.setStatus(`🎁 自动处理: ${name}`, true);
                        });

                        const prevModal = this.isModalActive;
                        this.isModalActive = hasModal;

                        if (hasModal) {
                            this.ui.setStatus('⏸️ 发现奖励/升级！', true);
                        } else if (prevModal && !hasModal) {
                            this.channel.port2.postMessage(null);
                        }

                        const health = GameStateAdapter.resolveHealth(game.session);
                        const status = game.session?.status;
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

                        const now = performance.now();
                        const elapsed = now - this.speedSampleTime;
                        if (elapsed >= CONFIG.SPEED_SAMPLE_INTERVAL_MS) {
                            const delta = game.world.revealedCount - this.speedSampleCount;
                            this.currentTps = Math.max(0, Math.round((delta * 1000) / elapsed));
                            this.ui.setSpeed(this.currentTps);

                            this.speedSampleTime = now;
                            this.speedSampleCount = game.world.revealedCount;
                        }
                        this.ui.setStatus(`已开辟: ${game.world.revealedCount.toLocaleString()} / 剩: ${game.world.remainingSafe.toLocaleString()}`);
                    }
                }
                requestAnimationFrame(renderTick);
            };
            requestAnimationFrame(renderTick);
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

            if (!g.world.seeded) {
                const startX = g.world.safeX >= 0 ? g.world.safeX : (g.world.cols >> 1);
                const startY = g.world.safeY >= 0 ? g.world.safeY : (g.world.rows >> 1);
                CanvasInputDispatcher.dig(g.view, startX, startY);
            }

            this.isRunning = true;
            this.isModalActive = false;
            this.isComputing = false;
            this.ui.setRunningState(true);

            this.speedSampleTime = performance.now();
            this.speedSampleCount = g.world.revealedCount;

            if (!this.engine || this.engine.seed !== g.world.seed || this.engine.cols !== g.world.cols) {
                this.engine = new WebGPUSweeperEngine(g.world);
            } else {
                this.engine.updateWorld(g.world);
            }

            this.channel.port2.postMessage(null);
        }

        stop() {
            this.isRunning = false;
            this.isModalActive = false;
            this.isComputing = false;
            this.ui.setRunningState(false);
            this.ui.setStatus('Status: Stopped', true);
        }

        async processGpuWork() {
            const game = unsafeWindow.__GAME;
            if (!game || !game.world) return;

            const result = await this.engine.sweepGpuBatch(game.session);
            if (result?.encounterChest) {
                CanvasInputDispatcher.dig(game.view, result.encounterChest.x, result.encounterChest.y);
            }

            if (game.world.remainingSafe <= 0) {
                this.ui.setStatus('🎉 全球安全区清理完成！', true);
                this.stop();
            }
        }
    }

    // =========================================================================
    // 9. 挂载入口
    // =========================================================================
    const app = new WorldSweeperBot();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => app.bootstrap());
    } else {
        app.bootstrap();
    }
})();