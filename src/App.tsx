/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import * as pdfjs from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import JSZip from 'jszip';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  Loader2, 
  Download, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Copy,
  Images
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { extractPageToMarkdown, PageExtraction, ExtractedImage, ExtractionMode } from './services/geminiService';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ProcessedImage extends ExtractedImage {
  dataUrl: string;
}

interface ProcessedPage extends Omit<PageExtraction, 'images'> {
  pageNumber: number;
  thumbnail: string;
  images: ProcessedImage[];
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ProcessedPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'markdown' | 'images'>('preview');
  const [selectedPage, setSelectedPage] = useState<number>(0);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
      setResults([]);
    } else {
      setError('Por favor, selecione um arquivo PDF válido.');
    }
  };

  const cropImage = (canvas: HTMLCanvasElement, box: [number, number, number, number]): string => {
    const [ymin, xmin, ymax, xmax] = box;
    const width = canvas.width;
    const height = canvas.height;

    const cropX = (xmin / 1000) * width;
    const cropY = (ymin / 1000) * height;
    const cropW = ((xmax - xmin) / 1000) * width;
    const cropH = ((ymax - ymin) / 1000) * height;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return '';

    ctx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return cropCanvas.toDataURL('image/png');
  };

  const processPdf = async () => {
    if (!file) return;

    setIsProcessing(true);
    setResults([]);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const totalPages = pdf.numPages;
      setProgress({ current: 0, total: totalPages });

      const processedPages: ProcessedPage[] = [];

      for (let i = 1; i <= totalPages; i++) {
        setProgress(prev => ({ ...prev, current: i }));
        
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) throw new Error('Could not create canvas context');
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport } as any).promise;
        
        const base64Image = canvas.toDataURL('image/png').split(',')[1];
        const extraction = await extractPageToMarkdown(base64Image, i, extractionMode);
        
        const processedImages: ProcessedImage[] = extraction.images.map(img => {
          let dataUrl = '';
          if (img.boundingBox) {
            dataUrl = cropImage(canvas, img.boundingBox);
          }
          return { ...img, dataUrl };
        });

        processedPages.push({
          ...extraction,
          images: processedImages,
          pageNumber: i,
          thumbnail: canvas.toDataURL('image/png')
        });

        // Update results incrementally
        setResults([...processedPages]);
      }
    } catch (err: any) {
      console.error(err);
      setError('Erro ao processar o PDF: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const fullMarkdown = results.map(r => r.markdown).join('\n\n---\n\n');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
  };

  const downloadAllImages = async () => {
    const allImages = results.flatMap(r => r.images);
    if (allImages.length === 0) return;

    const zip = new JSZip();
    const folder = zip.folder("extracted_images");
    
    if (!folder) return;

    allImages.forEach((img) => {
      if (img.dataUrl) {
        const base64Data = img.dataUrl.split(',')[1];
        folder.file(img.name, base64Data, { base64: true });
      }
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace('.pdf', '') || 'extracted'}_images.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadMarkdown = () => {
    const blob = new Blob([fullMarkdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file?.name.replace('.pdf', '') || 'extracted'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#111827] font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
              <FileText size={20} />
            </div>
            <h1 className="font-bold text-xl tracking-tight">Docling AI</h1>
          </div>
          
          {results.length > 0 && (
            <div className="flex items-center gap-3">
              {results.flatMap(r => r.images).length > 0 && (
                <button 
                  onClick={downloadAllImages}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  <Images size={16} />
                  Baixar Imagens (ZIP)
                </button>
              )}
              <button 
                onClick={downloadMarkdown}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-full text-sm font-medium hover:bg-orange-600 transition-colors shadow-sm"
              >
                <Download size={16} />
                Baixar Markdown
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!file || (results.length === 0 && !isProcessing) ? (
          <div className="max-w-2xl mx-auto mt-12">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-extrabold mb-4 text-gray-900">Transforme PDFs em Markdown Inteligente</h2>
              <p className="text-gray-500 text-lg">Extração de alta fidelidade com transcrição de imagens e tabelas usando IA Multimodal.</p>
            </div>

            <div 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed border-gray-300 rounded-3xl p-12 bg-white cursor-pointer transition-all hover:border-orange-400 hover:bg-orange-50/30 group",
                file && "border-orange-500 bg-orange-50/50"
              )}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept=".pdf" 
                className="hidden" 
              />
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 group-hover:text-orange-500 group-hover:bg-orange-100 transition-colors">
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-gray-700">
                    {file ? file.name : "Clique ou arraste um PDF aqui"}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">Apenas arquivos .pdf são suportados</p>
                </div>
              </div>
            </div>

            {file && !isProcessing && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 space-y-6"
              >
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-900 mb-4 text-center">O que você deseja extrair?</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {(['all', 'markdown', 'images', 'transcription'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setExtractionMode(mode)}
                        className={cn(
                          "px-4 py-3 rounded-2xl text-sm font-bold transition-all border-2",
                          extractionMode === mode 
                            ? "border-orange-500 bg-orange-50 text-orange-700 shadow-sm" 
                            : "border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200"
                        )}
                      >
                        {mode === 'all' ? 'Tudo' : 
                         mode === 'markdown' ? 'Markdown' : 
                         mode === 'images' ? 'Imagens' : 'Transcrição'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-center">
                  <button 
                    onClick={processPdf}
                    className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-bold text-lg hover:bg-black transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                  >
                    Começar Extração
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Sidebar / Progress */}
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Loader2 className={cn("animate-spin text-orange-500", !isProcessing && "hidden")} size={18} />
                  Status do Processamento
                </h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-gray-500">Páginas</span>
                    <span>{progress.current} / {progress.total}</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div 
                      className="bg-orange-500 h-full transition-all duration-300" 
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                  
                  {isProcessing && (
                    <p className="text-xs text-gray-400 italic">
                      Analisando página {progress.current}... Isso pode levar alguns segundos.
                    </p>
                  )}
                  
                  {!isProcessing && results.length > 0 && (
                    <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                      <CheckCircle2 size={16} />
                      Concluído com sucesso
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-4 border border-gray-200 shadow-sm overflow-hidden">
                <h3 className="font-bold text-gray-900 px-2 mb-4">Páginas Extraídas</h3>
                <div className="grid grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {results.map((res, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedPage(idx)}
                      className={cn(
                        "relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition-all",
                        selectedPage === idx ? "border-orange-500 ring-2 ring-orange-100" : "border-transparent hover:border-gray-300"
                      )}
                    >
                      <img src={res.thumbnail} alt={`Page ${res.pageNumber}`} className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-md backdrop-blur-sm">
                        Pág {res.pageNumber}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="lg:col-span-9 space-y-6">
              {/* Tabs */}
              <div className="flex p-1 bg-gray-100 rounded-2xl w-fit">
                {(['preview', 'markdown', 'images'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-6 py-2 rounded-xl text-sm font-bold transition-all capitalize",
                      activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    )}
                  >
                    {tab === 'preview' ? 'Visualização' : tab === 'markdown' ? 'Markdown' : 'Imagens'}
                  </button>
                ))}
              </div>

              <div className="bg-white rounded-[32px] border border-gray-200 shadow-sm min-h-[600px] overflow-hidden flex flex-col">
                <AnimatePresence mode="wait">
                  {activeTab === 'preview' && (
                    <motion.div 
                      key="preview"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-8 md:p-12 prose prose-orange max-w-none prose-headings:font-black prose-p:text-gray-600"
                    >
                      {results[selectedPage] ? (
                        <div className="markdown-body">
                          <ReactMarkdown>{results[selectedPage].markdown}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
                          <Loader2 className="animate-spin mb-4" size={48} />
                          <p>Aguardando processamento...</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === 'markdown' && (
                    <motion.div 
                      key="markdown"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex-1 flex flex-col"
                    >
                      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">Raw Markdown Output</span>
                        <button 
                          onClick={() => copyToClipboard(fullMarkdown)}
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors text-gray-600"
                          title="Copiar tudo"
                        >
                          <Copy size={18} />
                        </button>
                      </div>
                      <textarea 
                        readOnly
                        value={fullMarkdown}
                        className="flex-1 p-8 font-mono text-sm bg-white focus:outline-none resize-none min-h-[500px]"
                      />
                    </motion.div>
                  )}

                  {activeTab === 'images' && (
                    <motion.div 
                      key="images"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-8"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {results.flatMap(r => r.images).length === 0 ? (
                          <div className="col-span-full flex flex-col items-center justify-center h-[300px] text-gray-400">
                            <ImageIcon size={48} className="mb-4 opacity-20" />
                            <p>Nenhuma imagem detectada nesta extração.</p>
                          </div>
                        ) : (
                          results.flatMap(r => r.images).map((img, idx) => (
                            <div key={idx} className="border border-gray-100 rounded-2xl overflow-hidden bg-gray-50 flex flex-col">
                              <div className="p-4 bg-white border-b border-gray-100 flex justify-between items-center">
                                <span className="font-mono text-xs font-bold text-orange-600">{img.name}</span>
                                {img.dataUrl && (
                                  <a 
                                    href={img.dataUrl} 
                                    download={img.name}
                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
                                  >
                                    <Download size={14} />
                                  </a>
                                )}
                              </div>
                              <div className="p-4 space-y-3 flex-1">
                                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden flex items-center justify-center min-h-[150px]">
                                  {img.dataUrl ? (
                                    <img src={img.dataUrl} alt={img.name} className="max-w-full max-h-[300px] object-contain" />
                                  ) : (
                                    <div className="text-gray-400 italic text-sm">Sem prévia visual</div>
                                  )}
                                </div>
                                <div>
                                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">Descrição da IA</h4>
                                  <p className="text-sm text-gray-700 leading-relaxed">{img.description}</p>
                                </div>
                                {img.transcription && (
                                  <div>
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-1">Transcrição / Conteúdo</h4>
                                    <div className="p-3 bg-white rounded-xl border border-gray-200 text-xs text-gray-600 font-mono whitespace-pre-wrap">
                                      {img.transcription}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        )}
      </main>

      {error && (
        <div className="fixed bottom-8 right-8 bg-red-50 border border-red-200 p-4 rounded-2xl shadow-2xl flex items-center gap-3 max-w-md animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="text-red-500 shrink-0" />
          <p className="text-sm text-red-800 font-medium">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-auto">
            <ChevronRight size={20} />
          </button>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E5E7EB;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #D1D5DB;
        }
        .markdown-body h1 { font-size: 2.25rem; font-weight: 900; margin-bottom: 1.5rem; border-bottom: 2px solid #F3F4F6; padding-bottom: 0.5rem; }
        .markdown-body h2 { font-size: 1.5rem; font-weight: 800; margin-top: 2rem; margin-bottom: 1rem; }
        .markdown-body p { margin-bottom: 1.25rem; line-height: 1.75; }
        .markdown-body table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.875rem; }
        .markdown-body th { background: #F9FAFB; padding: 0.75rem; text-align: left; border: 1px solid #E5E7EB; font-weight: 700; }
        .markdown-body td { padding: 0.75rem; border: 1px solid #E5E7EB; }
        .markdown-body ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1.25rem; }
        .markdown-body blockquote { border-left: 4px solid #F97316; padding-left: 1rem; font-style: italic; color: #4B5563; margin: 1.5rem 0; }
      `}</style>
    </div>
  );
}
