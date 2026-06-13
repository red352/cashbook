# Cashbook OCR Service

独立 OCR 服务用于账单长截图识别。Cashbook 主应用通过 `NUXT_OCR_SERVICE_URL` 调用本服务，避免把 Python、OCR 推理库和 GPU 依赖放进主应用。

当前服务按 Python 3.12 维护，OCR 编排仍使用 `paddleocr==3.7.0`。CPU 镜像使用 PaddlePaddle CPU 运行时；GPU 镜像改为 PaddleOCR + ONNX Runtime CUDA Execution Provider，不再安装 `paddlepaddle-gpu`。

## 镜像类型

| 镜像 | 推理运行时 | 默认设备 | 默认模型 | 适用场景 |
|------|------------|----------|----------|----------|
| `cashbook-ocr:cpu` | `paddlepaddle==3.2.2` | `cpu` | `turbo` / tiny | 普通部署、低配置机器 |
| `cashbook-ocr:gpu-cu126` | NVIDIA CUDA 12.6/cuDNN runtime + `onnxruntime-gpu==1.20.1` | `gpu` | `fast` / small | 推荐 GPU 部署 |

GPU 镜像只保留 PaddleOCR/PaddleX 的流水线能力，模型推理由 ONNX Runtime 执行。默认基础镜像是 `nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04`，直接复用 NVIDIA 官方 CUDA/cuDNN runtime 层，不再在 Dockerfile 中维护 CUDA apt 包列表。

参考：

- [ONNX Runtime Install](https://onnxruntime.ai/docs/install/)
- [ONNX Runtime CUDA Execution Provider](https://onnxruntime.ai/docs/execution-providers/CUDA-ExecutionProvider.html)
- [NVIDIA Container Toolkit Docker 配置](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/docker-specialized.html)

## 构建镜像

以下命令都在 `ocr-service` 目录执行。

PowerShell：

```powershell
.\scripts\build-cpu.ps1
.\scripts\build-gpu.ps1
```

Linux/macOS shell：

```bash
./scripts/build-cpu.sh
./scripts/build-gpu.sh
```

默认 GPU 脚本生成 `cashbook-ocr:gpu-cu126`。APT 只安装 Python 和基础系统库，默认使用国内源，Debian/Ubuntu 包走阿里云镜像。

如需切换国内镜像源：

```powershell
.\scripts\build-gpu.ps1 `
  -AptDebianMirror http://mirrors.tuna.tsinghua.edu.cn/debian `
  -AptDebianSecurityMirror http://mirrors.tuna.tsinghua.edu.cn/debian-security `
  -AptUbuntuMirror http://mirrors.tuna.tsinghua.edu.cn/ubuntu
```

GPU 构建可覆盖的关键参数：

```powershell
.\scripts\build-gpu.ps1 `
  -BaseImage nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04 `
  -OnnxRuntimePackage onnxruntime-gpu==1.20.1 `
  -PipIndexUrl https://pypi.tuna.tsinghua.edu.cn/simple
```

构建时预下载模型：

```powershell
.\scripts\build-cpu.ps1 -PreloadModels
.\scripts\build-gpu.ps1 -PreloadModels
```

模型预热会写入镜像内 `/opt/paddlex-cache`。容器启动时 `docker-entrypoint.sh` 会把这部分缓存合并到运行时缓存目录。GPU 镜像预热阶段会强制使用 CPU 下载/初始化模型，运行时仍默认 `OCR_DEVICE=gpu`、`OCR_ENGINE=onnxruntime`。

## GPU 依赖策略

GPU 镜像不再安装 `paddlepaddle-gpu`，也不再清理 Paddle wheel 里的大动态库。默认依赖是：

- Python 包：`paddleocr==3.7.0`、`onnxruntime-gpu==1.20.1`
- 基础镜像：`nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04`
- apt 包：`python3`、`python3-venv`、`ca-certificates`、`libgomp1`、`libgl1`、`libglib2.0-0`、`zlib1g`

CUDA/cuDNN 动态库来自 NVIDIA 官方 runtime 基础镜像；宿主机只需要 NVIDIA 驱动和 NVIDIA Container Toolkit。不要把宿主机 `/usr/local/cuda` 挂进容器。

重复构建时有三层缓存：Docker 会复用 NVIDIA 基础镜像层；`Dockerfile.gpu` 使用 BuildKit cache mount 缓存 `/var/cache/apt` 和 `/var/lib/apt/lists`；pip 继续缓存到 `/tmp/pip-cache`。如果只改业务代码，依赖层不会重跑；如果 apt 层因为参数变化失效，也会复用 apt 下载缓存。

## 模型持久化

CPU Compose 把模型缓存挂载到 `ocr-service/.paddlex-cache`；GPU Compose 使用 Docker named volume `paddlex-cache` 挂载到 `/app/.paddlex-cache`：

```yaml
volumes:
  - paddlex-cache:/app/.paddlex-cache
```

只要不删除这个目录或 named volume，重建镜像或重建容器后都会复用模型。GPU ONNX Runtime 会下载 ONNX 格式模型，缓存目录通常会出现类似：

- `.paddlex-cache/official_models/PP-OCRv6_small_det_onnx`
- `.paddlex-cache/official_models/PP-OCRv6_small_rec_onnx`

旧的 Paddle 静态模型缓存目录，如 `PP-OCRv6_small_det` 和 `PP-OCRv6_small_rec`，不能直接给 `engine=onnxruntime` 使用，因为 ONNX Runtime 需要目录内存在 `inference.onnx`。

通常不需要手动指定模型目录。如果要固定到某个已持久化目录，可以设置：

```env
OCR_TEXT_DETECTION_MODEL_DIR="/app/.paddlex-cache/official_models/PP-OCRv6_small_det_onnx"
OCR_TEXT_RECOGNITION_MODEL_DIR="/app/.paddlex-cache/official_models/PP-OCRv6_small_rec_onnx"
```

## 启动

CPU：

```powershell
docker compose -f compose.cpu.yaml up -d
```

GPU：

```powershell
docker compose -f compose.gpu-cu126.yaml up -d
```

直接 `docker run`：

```powershell
docker run --rm -p 8000:8000 -v "${PWD}/.paddlex-cache:/app/.paddlex-cache" cashbook-ocr:cpu
docker run --rm --gpus all -e NVIDIA_DRIVER_CAPABILITIES=compute,utility -p 8000:8000 -v "${PWD}/.paddlex-cache:/app/.paddlex-cache" cashbook-ocr:gpu-cu126
```

GPU 模式要求宿主机已安装 NVIDIA 驱动和 NVIDIA Container Toolkit。Compose 文件使用 `gpus: all` 申请 GPU，并设置 `NVIDIA_VISIBLE_DEVICES=all`、`NVIDIA_DRIVER_CAPABILITIES=compute,utility`。只设置 NVIDIA 环境变量不会让 Docker 自动分配 GPU。

## Cashbook 配置

```env
NUXT_OCR_SERVICE_URL="http://127.0.0.1:8000/ocr"
NUXT_OCR_REQUEST_TIMEOUT_MS="60000"
```

如果 Cashbook 和 OCR 在同一个 Compose 网络中：

```env
NUXT_OCR_SERVICE_URL="http://ocr:8000/ocr"
```

## 健康检查

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
```

CPU 镜像应看到：

```json
{
  "device": "cpu",
  "performanceMode": "turbo",
  "engine": null
}
```

GPU 镜像应看到：

```json
{
  "device": "gpu",
  "performanceMode": "fast",
  "engine": "onnxruntime",
  "onnxRuntimeProviders": ["CUDAExecutionProvider", "CPUExecutionProvider"]
}
```

如果启动时报 `NVIDIA driver runtime is not visible`，或 Docker 报 `no known GPU vendor found`，说明容器没有拿到 GPU，优先检查 Docker Desktop/WSL GPU 支持、NVIDIA 驱动和 NVIDIA Container Toolkit。如果 `onnxRuntimeProviders` 只有 `CPUExecutionProvider`，说明 GPU 版 ONNX Runtime 未加载 CUDA provider。

用一张账单截图自测：

```powershell
curl.exe -F "image=@C:\path\to\bill.jpg" http://127.0.0.1:8000/ocr
```

## 本地 Python 开发

CPU 开发：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

本地 GPU/ONNX Runtime 验证：

```powershell
py -3.12 -m venv .venv-gpu
.\.venv-gpu\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-gpu.txt
$env:OCR_DEVICE="gpu"
$env:OCR_ENGINE="onnxruntime"
$env:OCR_PERFORMANCE_MODE="fast"
uvicorn app:app --host 0.0.0.0 --port 8000
```

Windows 本地 GPU 运行需要系统 PATH 能找到 CUDA/cuDNN 动态库；容器部署更推荐，因为依赖边界更清楚。

## 环境变量

| 变量 | CPU 默认 | GPU 默认 | 说明 |
|------|----------|----------|------|
| `OCR_DEVICE` | `cpu` | `gpu` | PaddleOCR 设备参数 |
| `OCR_ENGINE` | 空 | `onnxruntime` | PaddleOCR/PaddleX 推理引擎 |
| `OCR_PERFORMANCE_MODE` | `turbo` | `fast` | `turbo=tiny`，`fast=small`，`accurate=medium` |
| `OCR_ENABLE_MKLDNN` | `true` | `false` | CPU oneDNN/MKLDNN 加速；GPU 镜像默认关闭 |
| `OCR_CPU_THREADS` | `4` | `2` | CPU 推理线程数 |
| `OCR_REC_BATCH_SIZE` | `16` | `32` | 文本识别 batch size |
| `OCR_MODEL_SOURCE` | `bos` | `bos` | PaddleX 模型下载源 |
| `OCR_CACHE_HOME` | `/app/.paddlex-cache` | `/app/.paddlex-cache` | 模型缓存目录 |
| `OCR_TEMP_DIR` | `/app/.paddlex-cache/tmp` | `/app/.paddlex-cache/tmp` | 模型下载/解压临时目录 |
| `OCR_TEXT_DETECTION_MODEL_DIR` | 空 | 空 | 可选，显式指定检测 ONNX 模型目录 |
| `OCR_TEXT_RECOGNITION_MODEL_DIR` | 空 | 空 | 可选，显式指定识别 ONNX 模型目录 |
| `OCR_ENGINE_CONFIG` | 空 | 空 | 可选，JSON 对象，透传给 PaddleOCR `engine_config` |
| `OCR_MAX_SINGLE_IMAGE_HEIGHT` | `6000` | `6000` | 超过后按长图切片 |
| `OCR_SLICE_HEIGHT` | `6000` | `6000` | 长图切片高度 |
| `OCR_SLICE_OVERLAP` | `320` | `320` | 切片重叠高度 |

也可以用 `OCR_TEXT_DETECTION_MODEL`、`OCR_TEXT_RECOGNITION_MODEL` 显式指定模型名。

## 性能参考

在 1200x5352 的微信账单截图上，本机 CPU 常驻服务第二次推理基准约为：`medium` 54s、`small` 2.6s、`tiny` 0.85s。在 1200x20488 的美团月付长截图上，`small` 约 11s、`tiny` 约 4s。GPU 默认使用 `fast/small`，优先保证识别稳定性。

## 接口

- `GET /health`
- `POST /ocr`，字段名 `image`，返回 `{ width, height, durationMs, sliceCount, blocks }`
