import React, { useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from 'lucide-react'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Required styles for react-pdf
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

const CHECKPOINT_STYLES = {
    important: 'bg-amber-500 text-white',
    confusing: 'bg-rose-500 text-white',
    exam_worthy: 'bg-sky-500 text-white',
    revise: 'bg-emerald-500 text-white',
}

export default function PDFViewer({ fileUrl, title, onLoad, initialPage = 1, onPageChange, checkpoints = [] }) {
    const [numPages, setNumPages] = useState(null)
    const [pageNumber, setPageNumber] = useState(1)
    const [scale, setScale] = useState(1.0)
    const [loading, setLoading] = useState(true)

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages)
        const nextPage = Math.min(Math.max(initialPage || 1, 1), numPages)
        setPageNumber(nextPage)
        setLoading(false)
        onPageChange?.(nextPage)
        if (onLoad) onLoad()
    }

    // Handlers
    const goToPrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1))
    const goToNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages || 1))
    const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3.0))
    const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5))

    // Support keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') goToNextPage()
            if (e.key === 'ArrowLeft') goToPrevPage()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [numPages])

    useEffect(() => {
        if (!numPages) return
        const nextPage = Math.min(Math.max(initialPage || 1, 1), numPages)
        setPageNumber(prev => (prev === nextPage ? prev : nextPage))
    }, [initialPage, numPages])

    useEffect(() => {
        onPageChange?.(pageNumber)
    }, [pageNumber, onPageChange])

    const pageCheckpoints = checkpoints
        .filter(checkpoint => checkpoint.anchorKind === 'page' && Number(checkpoint.anchorValue) >= 1)
        .sort((a, b) => Number(a.anchorValue) - Number(b.anchorValue))

    return (
        <div className="flex flex-col w-full h-full bg-light-surface dark:bg-dark-surface overflow-hidden relative">
            {/* Toolbar */}
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3">
                {pageCheckpoints.length > 0 && (
                    <div className="flex max-w-[min(92vw,760px)] flex-wrap justify-center gap-2 px-3">
                        {pageCheckpoints.map(checkpoint => (
                            <button
                                key={checkpoint.id}
                                onClick={() => setPageNumber(Number(checkpoint.anchorValue))}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-lg transition-colors ${CHECKPOINT_STYLES[checkpoint.checkpointType] || 'bg-white/20 text-white'} ${Number(checkpoint.anchorValue) === pageNumber ? 'ring-2 ring-white/80' : ''}`}
                                title={`${checkpoint.checkpointType.replace('_', ' ')} on page ${checkpoint.anchorValue}`}
                            >
                                p{checkpoint.anchorValue}
                            </button>
                        ))}
                    </div>
                )}
                <div className="flex items-center gap-4 px-4 py-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-full shadow-xl text-white transition-opacity">
                <div className="flex items-center gap-1">
                    <button onClick={zoomOut} className="p-1.5 hover:bg-white/20 rounded-full transition-colors" title="Zoom Out">
                        <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-medium w-10 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={zoomIn} className="p-1.5 hover:bg-white/20 rounded-full transition-colors" title="Zoom In">
                        <ZoomIn className="w-4 h-4" />
                    </button>
                </div>

                <div className="w-px h-5 bg-white/20" />

                <div className="flex items-center gap-1">
                    <button onClick={goToPrevPage} disabled={pageNumber <= 1} className="p-1.5 hover:bg-white/20 rounded-full disabled:opacity-30 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-medium min-w-[3rem] text-center">
                        {pageNumber} / {numPages || '?'}
                    </span>
                    <button onClick={goToNextPage} disabled={pageNumber >= (numPages || 1)} className="p-1.5 hover:bg-white/20 rounded-full disabled:opacity-30 transition-colors">
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>

                <div className="w-px h-5 bg-white/20" />

                <a href={fileUrl} download={title || "document.pdf"} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-white/20 rounded-full transition-colors" title="Download Original PDF">
                    <Download className="w-4 h-4" />
                </a>
                </div>
            </div>

            {/* Document Container */}
            <div className="flex-1 overflow-auto bg-[#525659] dark:bg-[#323639] flex justify-center py-8">
                <Document
                    file={fileUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                        <div className="flex items-center justify-center h-full text-white/70 animate-pulse">
                            Loading Document...
                        </div>
                    }
                    error={
                        <div className="flex flex-col items-center justify-center h-full text-white/70 gap-2">
                            <span className="text-red-400">Failed to load PDF</span>
                            <span className="text-xs">The file might be too large or inaccessible.</span>
                        </div>
                    }
                >
                    <Page
                        pageNumber={pageNumber}
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        className="shadow-2xl"
                    />
                </Document>
            </div>
        </div>
    )
}
