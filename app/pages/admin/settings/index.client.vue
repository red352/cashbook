<script setup lang="ts">
// 需要登录
definePageMeta({
  layout: "admin",
  middleware: ["admin"],
});

const settings = ref<SystemSetting | any>({});

onMounted(() => {
  getConfig();
});

const getConfig = () => {
  doApi.get("api/admin/entry/settings/get").then((res) => {
    settings.value = res;
  });
};

const saveConfig = () => {
  doApi.post("api/admin/entry/settings/update", settings.value).then(() => {
    Alert.success("保存成功");
    getConfig();
  });
};

const settingTab = ref(1);

const ocrRulesText = ref("");
const ocrRulesFile = ref("");
const ocrRulesLoading = ref(false);
const ocrRulesSaving = ref(false);

const getOcrRules = () => {
  ocrRulesLoading.value = true;
  doApi
    .get<any>("api/admin/entry/settings/ocrRules")
    .then((res) => {
      ocrRulesText.value = JSON.stringify(res.rules || {}, null, 2);
      ocrRulesFile.value = res.file || "";
    })
    .finally(() => {
      ocrRulesLoading.value = false;
    });
};

const saveOcrRules = () => {
  let rules;
  try {
    rules = JSON.parse(ocrRulesText.value || "{}");
  } catch (err) {
    Alert.error("OCR规则不是合法JSON");
    return;
  }
  ocrRulesSaving.value = true;
  doApi
    .post("api/admin/entry/settings/ocrRules", rules)
    .then(() => {
      Alert.success("OCR规则保存成功");
      getOcrRules();
    })
    .finally(() => {
      ocrRulesSaving.value = false;
    });
};

watch(settingTab, (tab) => {
  if (tab === 3 && !ocrRulesText.value) {
    getOcrRules();
  }
});

const exporting = ref(false);
const exportAll = () => {
  exporting.value = true;
  doApi
    .get("api/admin/entry/settings/export")
    .then((res) => {
      Alert.success("导出成功，请保存文件");
      const fileName = "Cashbook-backup-" + new Date().getTime() + ".json";
      exportJson(fileName, JSON.stringify(res));
    })
    .finally(() => {
      exporting.value = false;
    });
};

const importing = ref(false);
const importAll = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = e.target?.result;
      if (!data) return;
      const formdata = new FormData();
      const blob = new Blob([data], { type: "application/json" });
      formdata.append("file", blob);
      importing.value = true;
      doApi
        .postform("api/admin/entry/settings/import", formdata)
        .then(() => {
          Alert.success("导入成功");
          getConfig();
        })
        .finally(() => {
          importing.value = false;
        });
    };
    reader.readAsText(file);
  };
  input.click();
};

const exportImging = ref(false);
const exportImgAll = () => {
  exportImging.value = true;
  doApi
    .download("api/admin/entry/settings/exportImg")
    .then((blob) => {
      Alert.success("导出成功，正在下载...");
      const fileName = "Cashbook-images-" + new Date().getTime() + ".zip";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    })
    .catch((err) => {
      Alert.error("导出失败: " + err);
    })
    .finally(() => {
      exportImging.value = false;
    });
};

const importImging = ref(false);
const importImgAll = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip";
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      Alert.error("请上传ZIP格式的文件");
      return;
    }

    const formdata = new FormData();
    formdata.append("file", file);
    importImging.value = true;
    doApi
      .postform("api/admin/entry/settings/importImg", formdata)
      .then((res: any) => {
        Alert.success(res.message || "导入成功");
        getConfig();
      })
      .catch((err) => {
        Alert.error("导入失败: " + err);
      })
      .finally(() => {
        importImging.value = false;
      });
  };
  input.click();
};
</script>

<template>
  <div class="space-y-4">
    <!-- 标签页 -->
    <div
      class="bg-gray-800/60 backdrop-blur-sm rounded-lg border border-gray-700 overflow-hidden"
    >
      <!-- 标签页头部 -->
      <div class="border-b border-gray-700">
        <nav class="flex space-x-8 px-6" aria-label="Tabs">
          <button
            @click="settingTab = 1"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              settingTab === 1
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300',
            ]"
          >
            <svg
              class="w-4 h-4 inline mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              ></path>
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              ></path>
            </svg>
            基本设置
          </button>
          <button
            @click="settingTab = 2"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              settingTab === 2
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300',
            ]"
          >
            <svg
              class="w-4 h-4 inline mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              ></path>
            </svg>
            备份与恢复
          </button>
          <button
            @click="settingTab = 3"
            :class="[
              'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
              settingTab === 3
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300',
            ]"
          >
            <svg
              class="w-4 h-4 inline mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c.251.023.501.05.75.082m-.75-.082a24.301 24.301 0 00-4.5 0m4.5 0v-.437c0-.966.784-1.75 1.75-1.75h1c.966 0 1.75.784 1.75 1.75v.437m0 0c1.52.14 3.004.405 4.45.78m-4.45-.78v5.714c0 .597.237 1.17.659 1.591L19 14.5"
              ></path>
            </svg>
            OCR规则
          </button>
        </nav>
      </div>

      <!-- 标签页内容 -->
      <div class="p-6">
        <!-- 基本设置 -->
        <div v-if="settingTab === 1" class="max-w-2xl mx-auto space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2"
              >站点名称</label
            >
            <input
              v-model="settings.title"
              type="text"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="请输入站点名称"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2"
              >站点描述</label
            >
            <textarea
              v-model="settings.description"
              rows="3"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="请输入站点描述"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2"
              >站点关键词</label
            >
            <textarea
              v-model="settings.keywords"
              rows="2"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="请输入站点关键词，用逗号分隔"
            ></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2"
              >是否开放注册功能</label
            >
            <select
              v-model="settings.openRegister"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option :value="true">开放</option>
              <option :value="false">不开放</option>
            </select>
          </div>

          <!-- 系统信息 -->
          <div class="bg-gray-700/50 rounded-lg p-4 space-y-2">
            <h3 class="text-sm font-medium text-gray-300 mb-3">系统信息</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gray-400">最后修改时间:</span>
                <span class="text-white ml-2">{{
                  formatDate(settings.updateBy || 0)
                }}</span>
              </div>
              <div>
                <span class="text-gray-400">系统版本:</span>
                <span class="text-white ml-2">{{ settings.version }}</span>
              </div>
            </div>
          </div>

          <!-- 保存按钮 -->
          <div class="flex justify-center pt-4">
            <button
              @click="saveConfig()"
              class="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 13l4 4L19 7"
                ></path>
              </svg>
              <span>保存设置</span>
            </button>
          </div>
        </div>

        <!-- 备份与恢复 -->
        <div v-if="settingTab === 2" class="max-w-4xl mx-auto space-y-8">
          <!-- 系统数据备份与恢复 -->
          <div class="bg-blue-900/20 border border-blue-700 rounded-lg p-6">
            <div class="flex items-center mb-4">
              <svg
                class="w-6 h-6 text-blue-400 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"
                ></path>
              </svg>
              <h3 class="text-lg font-medium text-white">系统数据备份与恢复</h3>
            </div>
            <p class="text-gray-300 text-sm mb-6">
              备份或恢复系统的所有数据，包括用户信息、账本数据等
            </p>
            <div class="flex flex-wrap gap-4">
              <button
                @click="exportAll()"
                :disabled="exporting"
                class="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg
                  v-if="exporting"
                  class="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  ></path>
                </svg>
                <span>{{ exporting ? "备份中..." : "备份数据" }}</span>
              </button>

              <button
                @click="importAll()"
                :disabled="importing"
                class="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg
                  v-if="importing"
                  class="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  ></path>
                </svg>
                <span>{{ importing ? "恢复中..." : "恢复数据" }}</span>
              </button>
            </div>
          </div>

          <!-- 小票图片备份与恢复 -->
          <div class="bg-green-900/20 border border-green-700 rounded-lg p-6">
            <div class="flex items-center mb-4">
              <svg
                class="w-6 h-6 text-green-400 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                ></path>
              </svg>
              <h3 class="text-lg font-medium text-white">小票图片备份与恢复</h3>
            </div>
            <p class="text-gray-300 text-sm mb-6">
              备份或恢复系统中的所有小票图片文件
            </p>
            <div class="flex flex-wrap gap-4">
              <button
                @click="exportImgAll()"
                :disabled="exportImging"
                class="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg
                  v-if="exportImging"
                  class="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  ></path>
                </svg>
                <span>{{ exportImging ? "备份中..." : "备份图片" }}</span>
              </button>

              <button
                @click="importImgAll()"
                :disabled="importImging"
                class="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white font-medium rounded-lg transition-colors flex items-center space-x-2"
              >
                <svg
                  v-if="importImging"
                  class="animate-spin h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle>
                  <path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <svg
                  v-else
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  ></path>
                </svg>
                <span>{{ importImging ? "恢复中..." : "恢复图片" }}</span>
              </button>
            </div>
          </div>

          <!-- 注意事项 -->
          <div class="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <div class="flex items-start">
              <svg
                class="w-5 h-5 text-yellow-400 mt-0.5 mr-3 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.268 15.5c-.77.833.192 2.5 1.732 2.5z"
                ></path>
              </svg>
              <div>
                <h4 class="text-yellow-400 font-medium mb-2">注意事项</h4>
                <ul class="text-yellow-300 text-sm space-y-1">
                  <li>• 备份操作会导出所有系统数据，请妥善保管备份文件</li>
                  <li>• 恢复操作会覆盖现有数据，请谨慎操作</li>
                  <li>• 图片备份仅包含小票图片，不包含系统数据</li>
                  <li>• 建议定期进行数据备份以防数据丢失</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <!-- OCR规则 -->
        <div v-if="settingTab === 3" class="max-w-5xl mx-auto space-y-4">
          <div class="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
            <h3 class="text-lg font-medium text-white mb-2">
              截图账单 OCR 识别规则
            </h3>
            <p class="text-gray-300 text-sm">
              规则用于控制支付宝、微信、美团月付截图里的金额列、标题列、日期格式和收支关键词。普通使用无需修改，适配页面变化时再调整。
            </p>
            <p v-if="ocrRulesFile" class="text-gray-400 text-xs mt-2">
              保存位置：{{ ocrRulesFile }}
            </p>
          </div>

          <textarea
            v-model="ocrRulesText"
            rows="24"
            spellcheck="false"
            class="w-full px-3 py-2 bg-gray-950 border border-gray-700 rounded-lg text-gray-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="正在加载OCR规则..."
          ></textarea>

          <div class="flex flex-wrap justify-end gap-3">
            <button
              @click="getOcrRules()"
              :disabled="ocrRulesLoading"
              class="px-5 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white font-medium rounded-lg transition-colors"
            >
              {{ ocrRulesLoading ? "加载中..." : "重新加载" }}
            </button>
            <button
              @click="saveOcrRules()"
              :disabled="ocrRulesSaving"
              class="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-medium rounded-lg transition-colors"
            >
              {{ ocrRulesSaving ? "保存中..." : "保存规则" }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
