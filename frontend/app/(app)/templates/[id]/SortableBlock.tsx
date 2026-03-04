'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { BlockEditor, type BlockEditorProps } from './BlockEditor'

interface SortableBlockProps extends BlockEditorProps {
  id: string
  accentColor: string
}

export function SortableBlock({ id, accentColor, ...blockProps }: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2">
      {/* Drag handle */}
      <div
        className="flex cursor-grab items-start pt-6 text-slate-600 transition-colors hover:text-slate-300 active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${blockProps.block.name}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </div>

      <div className="flex-1">
        <BlockEditor
          block={blockProps.block}
          accentColor={accentColor}
          onDeleted={blockProps.onDeleted}
          onItemAdded={blockProps.onItemAdded}
          onItemUpdated={blockProps.onItemUpdated}
          onBrowseLibrary={blockProps.onBrowseLibrary}
          onSaving={blockProps.onSaving}
          onSaved={blockProps.onSaved}
        />
      </div>
    </div>
  )
}
