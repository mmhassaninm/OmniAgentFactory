import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Folder, File, ChevronRight, Home, Download, FileText } from 'lucide-react'

interface FileItem {
  name: string
  type: 'file' | 'directory'
  size: number
  modified: string
  path: string
}

const FileExplorer: React.FC = () => {
  const [currentPath, setCurrentPath] = useState('')
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([])
  const [search, setSearch] = useState('')

  const { data: files = [], isLoading } = useQuery<FileItem[]>({
    queryKey: ['files', currentPath],
    queryFn: () =>
      fetch(`/api/files?path=${encodeURIComponent(currentPath)}`)
        .then(r => r.json())
        .catch(() => []),
  })

  useEffect(() => {
    const parts = currentPath.split('/').filter(Boolean)
    setBreadcrumbs(['/', ...parts])
  }, [currentPath])

  const filteredFiles = files.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  const handleNavigate = (path: string) => {
    setCurrentPath(path)
  }

  const handleBreadcrumbClick = (index: number) => {
    if (index === 0) {
      setCurrentPath('')
    } else {
      const parts = breadcrumbs.slice(1, index + 1)
      setCurrentPath(parts.join('/'))
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Toolbar */}
      <div className="border-b border-gray-200 p-3 space-y-2">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <button
                onClick={() => handleBreadcrumbClick(idx)}
                className="text-blue-600 hover:underline"
              >
                {idx === 0 ? '📁 Root' : crumb}
              </button>
              {idx < breadcrumbs.length - 1 && <ChevronRight size={16} />}
            </React.Fragment>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search files..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* File Grid */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center text-gray-500">No files found</div>
        ) : (
          <div className="grid grid-cols-4 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {filteredFiles.map(file => (
              <div
                key={file.path}
                onClick={() => {
                  if (file.type === 'directory') {
                    handleNavigate(file.path)
                  }
                }}
                className="flex flex-col items-center gap-2 p-2 rounded hover:bg-blue-50 cursor-pointer transition group"
              >
                <div className="text-3xl group-hover:scale-110 transition">
                  {file.type === 'directory' ? <Folder size={32} /> : <File size={32} />}
                </div>
                <div className="text-center">
                  <div className="text-xs font-semibold truncate max-w-[80px]">
                    {file.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {file.type === 'file' && `${(file.size / 1024).toFixed(1)}KB`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-600 bg-gray-50">
        {filteredFiles.length} items
      </div>
    </div>
  )
}

export default FileExplorer
