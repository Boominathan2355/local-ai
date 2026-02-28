import React from 'react'

import type { ModelStatusType } from '../../types/model.types'

interface ModelStatusIndicatorProps {
    status: ModelStatusType
}

const STATUS_LABELS: Record<ModelStatusType, string> = {
    loading: 'Loading Model...',
    ready: 'Model Ready',
    generating: 'Generating...',
    error: 'Model Error',
    disconnected: 'Disconnected'
}

export const ModelStatusIndicator: React.FC<ModelStatusIndicatorProps> = ({ status }) => {
    return (
        <div className="model-status" id="model-status">
            <div className={`model-status__dot model-status__dot--${status}`} />
            <span className="model-status__text">{STATUS_LABELS[status]}</span>
        </div>
    )
}
