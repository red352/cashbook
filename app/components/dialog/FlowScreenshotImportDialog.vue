<template>
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
    @click="closeDialog"
  >
    <div
      class="bg-surface dark:bg-surface-dark rounded-lg shadow-xl w-full max-w-6xl max-h-[92vh] flex flex-col border border-frame dark:border-frame-dark"
      @click.stop
    >
      <div
        class="px-4 py-3 border-b border-frame-light dark:border-frame-dark flex justify-between items-center"
      >
        <h3 class="text-lg font-semibold text-ink-primary dark:text-ink-onDark">
          截图账单导入
        </h3>
        <button
          @click="closeDialog"
          class="text-ink-muted hover:text-ink-secondary dark:text-ink-onDark dark:hover:text-ink-onDark hover:bg-surface-soft dark:hover:bg-surface-darkMuted p-1 rounded transition-colors"
        >
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>

      <div class="p-4 border-b border-frame-light dark:border-frame-dark">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label class="block text-sm font-medium text-ink-secondary dark:text-ink-onDark mb-1">
              账单来源
            </label>
            <select
              v-model="source"
              class="w-full px-3 py-2 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option
                v-for="option in sourceOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-ink-secondary dark:text-ink-onDark mb-1">
              默认年份
            </label>
            <input
              v-model.number="year"
              type="number"
              min="2000"
              max="2100"
              class="w-full px-3 py-2 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-ink-secondary dark:text-ink-onDark mb-1">
              流水归属
            </label>
            <input
              v-model="attribution"
              type="text"
              placeholder="可选"
              class="w-full px-3 py-2 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark placeholder-ink-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div class="flex items-end gap-2">
            <input
              ref="fileInput"
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="onFileChange"
            />
            <button
              @click="() => fileInput?.click()"
              class="flex-1 px-3 py-2 bg-surface-muted hover:bg-surface-soft dark:bg-surface-darkMuted dark:hover:bg-surface-dark text-ink-secondary dark:text-ink-onDark rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <PhotoIcon class="w-4 h-4" />
              {{ files.length > 0 ? `${files.length} 张图片` : "选择图片" }}
            </button>
            <button
              @click="recognizeScreenshots"
              :disabled="recognizing || files.length === 0"
              class="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <span
                v-if="recognizing"
                class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"
              ></span>
              <SparklesIcon v-else class="w-4 h-4" />
              {{ recognizing ? "识别中" : "识别" }}
            </button>
          </div>
        </div>

        <div
          v-if="warnings.length > 0"
          class="mt-3 text-xs text-state-warning dark:text-state-warning space-y-1"
        >
          <div v-for="warning in warnings" :key="warning">{{ warning }}</div>
        </div>
      </div>

      <div class="flex-1 overflow-hidden p-4">
        <div
          v-if="candidates.length === 0"
          class="h-72 border-2 border-dashed border-frame-light dark:border-frame-dark rounded-lg flex flex-col items-center justify-center text-ink-muted dark:text-ink-onDark/70"
        >
          <PhotoIcon class="w-10 h-10 mb-3" />
          <div class="text-sm">选择账单长截图后开始识别</div>
        </div>

        <div v-else class="h-full flex flex-col border border-frame-light dark:border-frame-dark rounded-lg overflow-hidden">
          <div class="px-3 py-2 bg-surface-soft dark:bg-surface-darkMuted border-b border-frame-light dark:border-frame-dark flex flex-wrap gap-3 items-center justify-between">
            <div class="text-sm text-ink-secondary dark:text-ink-onDark">
              共识别 {{ candidates.length }} 条，已选 {{ selectedCount }} 条
              <span v-if="lowConfidenceCount > 0" class="text-state-warning ml-2">
                {{ lowConfidenceCount }} 条需确认
              </span>
            </div>
            <label class="flex items-center gap-2 text-sm text-ink-secondary dark:text-ink-onDark">
              <input type="checkbox" :checked="isAllSelected" @change="toggleAll" />
              全选
            </label>
          </div>

          <div class="overflow-auto max-h-[56vh]">
            <table class="w-full min-w-[920px]">
              <thead class="bg-surface-soft dark:bg-surface-darkMuted sticky top-0 z-10">
                <tr class="border-b border-frame-light dark:border-frame-dark">
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">选</th>
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">日期</th>
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">收支</th>
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">金额</th>
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">名称</th>
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">类型</th>
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">置信度</th>
                  <th class="px-2 py-2 text-left text-xs font-medium text-ink-muted">备注</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-frame-light dark:divide-frame-dark">
                <tr
                  v-for="(item, index) in candidates"
                  :key="index"
                  :class="[
                    'hover:bg-surface-soft dark:hover:bg-surface-darkMuted',
                    item.confidence < minConfidence ? 'bg-state-warning/10' : '',
                  ]"
                >
                  <td class="px-2 py-2">
                    <input v-model="item.selected" type="checkbox" />
                  </td>
                  <td class="px-2 py-2">
                    <input
                      v-model="item.day"
                      type="date"
                      class="w-32 px-2 py-1 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark"
                    />
                  </td>
                  <td class="px-2 py-2">
                    <select
                      v-model="item.flowType"
                      class="w-24 px-2 py-1 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark"
                    >
                      <option value="支出">支出</option>
                      <option value="收入">收入</option>
                      <option value="不计收支">不计收支</option>
                    </select>
                  </td>
                  <td class="px-2 py-2">
                    <input
                      v-model.number="item.money"
                      type="number"
                      step="0.01"
                      class="w-24 px-2 py-1 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark"
                    />
                  </td>
                  <td class="px-2 py-2">
                    <input
                      v-model="item.name"
                      type="text"
                      class="w-56 px-2 py-1 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark"
                    />
                  </td>
                  <td class="px-2 py-2">
                    <input
                      v-model="item.industryType"
                      type="text"
                      class="w-28 px-2 py-1 text-sm border border-frame dark:border-frame-dark rounded bg-surface dark:bg-surface-dark text-ink-primary dark:text-ink-onDark"
                    />
                  </td>
                  <td class="px-2 py-2 text-sm whitespace-nowrap">
                    <span
                      :class="[
                        'px-2 py-1 rounded text-xs',
                        item.confidence < minConfidence
                          ? 'bg-state-warning/20 text-state-warning'
                          : 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
                      ]"
                    >
                      {{ Math.round(item.confidence * 100) }}%
                    </span>
                  </td>
                  <td class="px-2 py-2 text-sm text-ink-muted max-w-64 truncate" :title="item.description">
                    {{ item.description }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div
        class="px-4 py-3 border-t border-frame-light dark:border-frame-dark bg-surface-soft dark:bg-surface-darkMuted flex flex-col sm:flex-row justify-end gap-2"
      >
        <button
          @click="closeDialog"
          class="px-4 py-2 bg-surface-muted hover:bg-surface-soft dark:bg-surface-darkMuted dark:hover:bg-surface-dark text-ink-secondary dark:text-ink-onDark rounded text-sm font-medium transition-colors"
        >
          取消
        </button>
        <button
          @click="submitImport"
          :disabled="importing || selectedCount === 0"
          class="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <span
            v-if="importing"
            class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"
          ></span>
          <CloudArrowUpIcon v-else class="w-4 h-4" />
          {{ importing ? "导入中" : "确认导入" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  CloudArrowUpIcon,
  PhotoIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/vue/24/outline";

type ScreenshotSource = "alipay" | "wechat" | "meituan";

type ScreenshotCandidate = Flow & {
  selected: boolean;
  confidence: number;
  origin?: string;
  rawTexts?: string[];
  bbox?: number[];
  source?: ScreenshotSource;
};

const props = defineProps<{
  successCallback?: () => void;
}>();

const emits = defineEmits<{
  close: [];
}>();

useEscapeKey(() => closeDialog());

const sourceOptions: { label: string; value: ScreenshotSource }[] = [
  { label: "支付宝", value: "alipay" },
  { label: "微信", value: "wechat" },
  { label: "美团月付", value: "meituan" },
];

const source = ref<ScreenshotSource>("wechat");
const year = ref(new Date().getFullYear());
const attribution = ref("");
const fileInput = ref<HTMLInputElement>();
const files = ref<File[]>([]);
const candidates = ref<ScreenshotCandidate[]>([]);
const warnings = ref<string[]>([]);
const minConfidence = ref(0.72);
const recognizing = ref(false);
const importing = ref(false);

const selectedCount = computed(
  () => candidates.value.filter((item) => item.selected).length
);
const lowConfidenceCount = computed(
  () => candidates.value.filter((item) => item.confidence < minConfidence.value).length
);
const isAllSelected = computed(
  () => candidates.value.length > 0 && selectedCount.value === candidates.value.length
);

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  files.value = Array.from(target.files || []);
  candidates.value = [];
  warnings.value = [];
};

const toggleAll = () => {
  const next = !isAllSelected.value;
  candidates.value.forEach((item) => {
    item.selected = next;
  });
};

const recognizeScreenshots = () => {
  if (files.value.length === 0) {
    Alert.warning("请先选择账单截图");
    return;
  }

  const formdata = new FormData();
  formdata.append("source", source.value);
  formdata.append("year", String(year.value || new Date().getFullYear()));
  files.value.forEach((file) => {
    formdata.append("images", file);
  });

  recognizing.value = true;
  doApi
    .postform<any>("api/entry/flow/screenshot/recognize", formdata)
    .then((res) => {
      minConfidence.value = Number(res.minConfidence || 0.72);
      warnings.value = res.warnings || [];
      candidates.value = (res.flows || []).map((flow: any) => ({
        ...flow,
        selected: true,
        confidence: Number(flow.confidence || 0),
      }));
      if (candidates.value.length > 0) {
        Alert.success("截图识别完成，请预览后确认导入");
      } else {
        Alert.warning("未识别到流水，请检查来源或截图区域");
      }
    })
    .catch(() => {
      candidates.value = [];
    })
    .finally(() => {
      recognizing.value = false;
    });
};

const submitImport = () => {
  const flows = candidates.value
    .filter((item) => item.selected)
    .map((item) => ({
      day: item.day,
      flowType: item.flowType,
      industryType: item.industryType,
      payType: item.payType,
      money: Number(item.money || 0),
      name: item.name,
      description: item.description,
      attribution: attribution.value.trim() || item.attribution,
      origin: item.origin,
    }))
    .filter((item) => item.day && item.flowType && item.money > 0);

  if (flows.length === 0) {
    Alert.error("没有可导入的数据");
    return;
  }

  importing.value = true;
  doApi
    .post<any>("api/entry/flow/imports", {
      flows,
      bookId: localStorage.getItem("bookId"),
    })
    .then((res) => {
      if (res && res.count > 0) {
        Alert.success("导入成功, 共导入" + res.count + "条流水");
        props.successCallback?.();
        closeDialog();
      } else {
        Alert.error("导入失败，请重试！");
      }
    })
    .catch(() => {
      Alert.error("导入失败，请重试！");
    })
    .finally(() => {
      importing.value = false;
    });
};

const closeDialog = () => {
  emits("close");
};
</script>
