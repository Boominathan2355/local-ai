import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface VersionPagerProps {
    current: number
    total: number
    onPrev: () => void
    onNext: () => void
}

export const VersionPager: React.FC<VersionPagerProps> = ({
    current,
    total,
    onPrev,
    onNext
}) => {
    if (total <= 1) return null

    return (
        <div className="version-pager">
            <button
                className="version-pager__btn"
                onClick={onPrev}
                disabled={current <= 1}
                title="Previous version"
            >
                <ChevronLeft size={14} />
            </button>
            <span className="version-pager__info">
                {current} / {total}
            </span>
            <button
                className="version-pager__btn"
                onClick={onNext}
                disabled={current >= total}
                title="Next version"
            >
                <ChevronRight size={14} />
            </button>
        </div>
    )
}
