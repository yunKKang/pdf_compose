<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  uploadFiles: [files: File[]]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)

const processFiles = (files: File[]) => {
  if (!files.length) {
    return
  }

  const pdfFiles = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
  if (!pdfFiles.length) {
    window.alert('仅支持 PDF 文件')
    return
  }

  emit('uploadFiles', pdfFiles)
}

const onInputChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files ? [...target.files] : []
  processFiles(files)
  target.value = ''
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  dragActive.value = false
  const files = event.dataTransfer?.files ? [...event.dataTransfer.files] : []
  processFiles(files)
}

const openDialog = () => {
  fileInput.value?.click()
}
</script>

<template>
  <div
    class="rounded-xl border border-dashed p-4 transition"
    :class="dragActive ? 'border-teal-700 bg-teal-50' : 'border-slate-300 bg-slate-50/80'"
    @dragover.prevent="dragActive = true"
    @dragleave.prevent="dragActive = false"
    @drop="onDrop"
  >
    <input
      ref="fileInput"
      type="file"
      accept="application/pdf"
      multiple
      class="hidden"
      @change="onInputChange"
    >
    <p class="text-sm font-semibold text-slate-700">拖拽 PDF 到这里</p>
    <p class="mt-1 text-xs text-slate-500">支持一次选择多个 PDF（建议单文件 50MB 以内）</p>
    <button
      type="button"
      class="mt-3 rounded-md border border-teal-700 bg-white px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-50"
      @click="openDialog"
    >
      选择 PDF（可多选）
    </button>
  </div>
</template>
