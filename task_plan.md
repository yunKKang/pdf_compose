# Task Plan: PDF Compose - 论文图表拼版工具

## Goal
构建一个面向科研人员的 Web 端 PDF 图表拼版工具。从论文 PDF 中裁剪图表，自由排版拼接，无损导出为高质量 PDF。纯前端实现，通过 URL 分享给课题组使用。

## Context
- 用户场景：科研人员需要从论文 PDF 中裁剪图表，重新排版组合
- 输入：PDF 文件（3-5MB 以内），可选 SVG
- 输出：无损矢量 PDF
- 分发：静态网站部署，分享 URL 即用
- 隐私：所有处理在浏览器本地完成，不上传服务器

## Technical Stack
| 组件 | 选型 |
|------|------|
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite |
| PDF 预览 | pdfjs-dist (PDF.js) |
| 画布交互 | Fabric.js v6 |
| PDF 导出 | pdf-lib |
| PWA | vite-plugin-pwa |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Pinia |
| 部署 | Vercel / GitHub Pages |

## Architecture

### 核心设计：预览导出分离

```text
预览层（栅格化，仅显示用）：
PDF -> PDF.js -> Canvas 位图 -> Fabric.js 对象 -> 用户拖拽交互

导出层（矢量保留，零质量损失）：
原始 PDF -> pdf-lib embedPage -> 应用变换参数(位置/缩放/裁剪/旋转) -> 输出 PDF
```

## Definition of Done
- [x] 核心流程可用：导入 PDF -> 画布排版 -> 导出 PDF
- [x] 导出精度通过验收：尺寸误差 <= 0.5pt，位置误差 <= 1pt
- [x] 关键操作稳定：拖拽/缩放/旋转/裁剪连续 100 次无崩溃
- [x] 性能阈值达标：5MB PDF 在目标设备首次预览 < 3s
- [x] 兼容性通过：Chrome/Edge 最新稳定版可用
- [x] 错误处理可见：不支持文件、导出失败、内存不足都有明确提示
- [x] 多来源拼接可用：可连续导入多个 PDF 并统一导出

## 无损导出边界（Scope of Fidelity）
- 保证保留：页面矢量内容、几何形状、文本轮廓与路径精度
- 条件保留：透明度与混合模式（取决于源 PDF 特性）
- 不承诺保留：交互式表单、批注、外链、JavaScript 动作
- 导出策略：始终以源 PDF 页面为基准进行 `embedPage`，禁止预览位图回写
- SVG 策略：矢量优先，复杂特性（filter/mask/pattern/textPath/渐变）自动位图降级

## 数据模型（最小可执行）
```ts
type CanvasItem = {
  id: string
  sourcePdfId: string
  pageIndex: number
  xPt: number
  yPt: number
  widthPt: number
  heightPt: number
  rotateDeg: number
  cropLeftPt: number
  cropBottomPt: number
  cropRightPt: number
  cropTopPt: number
  zIndex: number
}

type ComposeDocument = {
  pageWidthPt: number
  pageHeightPt: number
  items: CanvasItem[]
  version: number
}
```

## 坐标映射规范
- 输入参数：`viewportScale`, `devicePixelRatio`, `canvasZoom`, `pageRotateDeg`
- 单位规则：内部导出统一使用 pt，UI 展示可用 px/mm
- 方向规则：仅在导出层执行 y 轴翻转，避免双重变换
- 验证规则：使用带标尺的基准 PDF 做映射快照测试

## 测试与验收矩阵
| 维度 | 用例 | 通过标准 |
|------|------|----------|
| 精度 | 单页 4 角定位 + 裁剪 + 旋转 | 偏差 <= 1pt |
| 质量 | 文字/线条放大 800% 观察 | 无明显栅格化 |
| 性能 | 5MB 文档导入与预览 | 首屏 < 3s，交互不卡顿 |
| 稳定性 | 连续撤销重做 200 次 | 无状态错乱 |
| 兼容 | Chrome/Edge | 功能一致 |

## 基准样本（Phase 1 默认）
- sample_a_line_text.pdf：细线 + 小字号文字
- sample_b_rotation_crop.pdf：旋转对象 + 多次裁剪
- sample_c_transparency.pdf：透明图层 + 叠放场景

## 发布与回滚
- 版本策略：`v0.x` 迭代，功能冻结后 `v1.0.0`
- 发布步骤：`main` 打 tag -> 自动构建 -> 部署 -> 冒烟测试
- 回滚步骤：保留最近 3 个部署版本，异常时一键回滚到上个稳定版
- 变更记录：每次发布更新 changelog（新增/修复/已知问题）

## Out of Scope（v1 不做）
- OCR 与图片识别
- 富文本编辑器能力
- PDF 注释与表单编辑
- 多人实时协作

## Phases

### Phase 1: 项目骨架 + PDF 导入预览
- [x] 初始化 Vite + Vue3 + TS + Tailwind v4
- [x] 集成 Pinia
- [x] 集成 PDF.js 与 worker
- [x] 拖拽上传与 PDF 解析
- [x] 左侧缩略图面板
- [x] 基础布局（顶栏/侧栏/画布/属性面板）
- [x] 导出最小闭环 Spike（1 页导入 + 1 页导出精度验证）

### Phase 2: 画布交互
- [x] 集成 Fabric.js v6
- [x] 页面拖入画布
- [x] 拖拽/缩放/旋转/多选/删除
- [x] 画布缩放与平移

### Phase 3: 裁剪
- [x] 裁剪模式与裁剪框
- [x] 裁剪预览
- [x] 裁剪参数持久化
- [x] 重置裁剪

### Phase 4: 无损导出
- [x] 坐标映射（Canvas -> PDF）
- [x] embedPage + drawPage 生成输出
- [x] 裁剪与旋转导出
- [x] 下载导出文件

### Phase 5: 排版增强
- [x] 对齐辅助线与网格吸附
- [x] 对齐/分布工具
- [x] 图层顺序控制
- [x] Undo/Redo

### Phase 6: SVG 与体验优化
- [x] SVG 导入与统一交互
- [x] 多页输出
- [x] 常用模板
- [x] PWA 完善与性能优化

## Risks
| 风险 | 等级 | 应对 |
|------|------|------|
| 坐标映射精度 | 高 | 先做最小导出验证与尺寸对比 |
| 旋转+裁剪组合 | 中 | 分步验证变换矩阵 |
| 大页数预览性能 | 低 | 懒加载与虚拟列表 |
