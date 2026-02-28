import React from 'react'

export const StreamingIndicator: React.FC = () => {
    return (
        <div className="streaming-indicator" id="streaming-indicator">
            <div className="streaming-indicator__dot" />
            <div className="streaming-indicator__dot" />
            <div className="streaming-indicator__dot" />
        </div>
    )
}
