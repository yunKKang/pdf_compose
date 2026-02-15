# Findings: PDF Compose

## 2026-02-15 技术调研结论

### 开源项目对比
| 项目 | 特点 | 结论 |
|------|------|------|
| Stirling-PDF | 功能多、Web 化 | 不偏向自由画布拼版 |
| PDF Arranger | 桌面端页面级拖拽 | 非 Web 自由排版 |
| pdfimpose / pdfjam | CLI 拼版 | 以预设布局为主 |

结论：现成开源项目很少覆盖「Web + 自由拖拽 + 无损导出」完整场景，需要自行实现。

### 核心技术点
- pdf-lib `embedPage` 可将源 PDF 页面嵌入输出 PDF，并保留矢量精度
- Fabric.js 负责画布交互（拖拽/缩放/旋转/裁剪）
- PDF.js 仅做预览渲染，不参与最终质量链路

### 坐标系注意事项
```text
Canvas: 左上角原点，y 向下，单位 px
PDF:    左下角原点，y 向上，单位 pt
```

导出时必须做坐标映射，避免位置或裁剪偏移。

### 分发建议
- 优先静态部署（Vercel / GitHub Pages）
- 加 PWA 提升可用性（离线缓存、桌面安装体验）
- 课题组分享最省成本：直接发 URL

## 计划 review 补充（2026-02-15）

### 已识别漏洞与不足
- 验收口径缺失：之前没有量化的 DoD，容易出现“功能看起来完成但质量不可证”
- 无损边界不清：需要明确哪些 PDF 特性保留、哪些不承诺
- 坐标映射参数不全：除坐标方向外，还要纳入 DPR、viewportScale、canvasZoom、页面旋转
- 风险闭环不足：只有风险识别，没有触发条件与回滚路径

### 无损导出最佳实践（落地版）
- 预览与导出严格分层：预览可位图，导出必须回到源 PDF page object
- 导出数据用 pt：避免 px/mm 混用导致累积误差
- 变换顺序固定：先裁剪、再缩放、再旋转、最后平移
- 做基准件回归：准备 3 份基准 PDF（细线、文字、透明层）每次版本都比对

### 分发与隐私注意事项
- 默认本地处理：不引入上传 API，不记录 PDF 内容日志
- PWA 缓存白名单：只缓存静态资源，排除用户文件
- 错误恢复：导出失败保留当前布局 JSON，允许一键重试

### 待实现阶段补齐的引用
- PDF.js 官方文档（worker、viewport、render task）
- pdf-lib 官方 API（embedPage/drawPage）
- Fabric.js v6 文档（对象变换、clipPath、序列化）

## 实施过程新增发现（2026-02-15）
- `pdfjs-dist` 的 worker 通过 `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` 在 Vite 下可正常打包
- Fabric 7 与 Vue 组合可直接使用 `Canvas` 与 `FabricImage.fromURL`，支持对象交互
- 当前构建产物主包约 760KB（含 Fabric + PDF.js 逻辑），Vite 会有 chunk size 提示，后续可做按需拆分
- PWA 已启用且仅缓存静态资源，用户 PDF 文件不进入缓存清单
- 当前已打通导出主链路：canvas 对象 -> 坐标映射 -> pdf-lib embedPage/drawPage -> 文件下载
- 裁剪参数已写入对象元数据（left/top/right/bottom 百分比），可用于后续精度校准
- 已补齐可视化裁剪框：可创建/应用/取消裁剪框，并同步到对象元数据
- 已知不足：当前导出精度尚未跑基准件回归测试，下一步需做误差标定
- 已生成三份样本 PDF 用于回归：`samples/sample_a_line_text.pdf`、`samples/sample_b_rotation_crop.pdf`、`samples/sample_c_transparency.pdf`
- 已新增导出回归脚本：`pnpm regression`，并生成 `samples/export_regression_report.md`（当前结果 PASS）
- 导出映射已抽离为 `src/utils/coordinate_transform.ts`，后续可在常量中做校准微调
- 排版增强已落地：网格显示切换、网格吸附开关、图层顺序控制、Undo/Redo 快捷操作
- 当前快捷键补充：`Ctrl+Z` 撤销、`Ctrl+Y` 重做、`[` 下移一层、`]` 上移一层、`G` 切换网格
- 性能优化已落地：Vite `manualChunks` 分包后，主入口 `index-*.js` 由约 1.2MB 降到约 23.6KB，重型依赖拆到 vendor chunk
- 当前构建包（gzip）约：`vendor-fabric` 84.8KB、`vendor-pdfjs` 119.3KB、`vendor-pdflib` 177.6KB、`vendor-vue` 26.5KB
- SVG 已接入统一交互：侧栏导入 SVG 资产后可拖拽到同一 Fabric 画布，复用移动/缩放/旋转/图层能力
- 当前限制：SVG 作为画布元素可编辑，但导出链路暂未纳入 SVG 矢量直出（后续可补）
- 多页导出已接入：PDF 对象支持 `outputPage` 标记，导出时按页号分组生成多页 PDF
- 当前多页策略：通过“分配到页”给选中对象打页码，未打标对象默认导出到第 1 页
- 常用模板已接入：选中对象可一键应用 `2x1` 与 `2x2` 模板进行批量排版
- 历史记录已改为单机制入栈并设置上限（MAX_HISTORY=100），避免撤销栈膨胀
- 导出前后提示已补齐：空画布、失败提示、导出统计（PDF/SVG矢量/SVG位图）
- SVG 导出已接入“矢量优先 + 自动降级位图”：简单 path 尝试矢量，复杂特性自动降级
- 当前 SVG 矢量限制：不覆盖 filter/mask/pattern/textPath/渐变，命中后走位图降级
- 画布模糊问题已修复：侧栏继续使用低分辨率缩略图，拖入画布时改用高分辨率预览图（canvasPreviewDataUrl）
- 交互误导已修复：移除画布下方预览副本区域，保留状态说明，明确“仅主画布对象参与导出”
- 多来源 PDF 拼接已支持：侧栏会累计显示所有已导入 PDF 的页面，导出按页面来源自动回溯源文件
- 导出前预检已增强：未上传/空画布/无效对象均给明确提示，导出结果含无效对象计数
