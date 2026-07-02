import React, { useState, useEffect } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download } from 'lucide-react'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Required styles for react-pdf
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

export default function PDFViewer({ fileUrl, title, onLoad }) {
    const [numPages, setNumPages] = useState(null)
    const [pageNumber, setPageNumber] = useState(1)
    const [scale, setScale] = useState(1.0)
    const [loading, setLoading] = useState(true)

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages)
        setPageNumber(1)
        setLoading(false)
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

    return (
        <div className="flex flex-col w-full h-full bg-light-surface dark:bg-dark-surface overflow-hidden relative">
            {/* Toolbar */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 bg-black/70 backdrop-blur-md border border-white/10 rounded-full shadow-xl text-white z-10 transition-opacity">
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
