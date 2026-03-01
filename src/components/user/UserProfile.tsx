import React, { useState } from 'react'
import { X, User } from 'lucide-react'
import type { AppSettings } from '../../types/settings.types'

interface UserProfileProps {
    isOpen: boolean
    onClose: () => void
    settings: AppSettings
    onUpdateSettings: (changes: Partial<AppSettings>) => void
}

export const UserProfile: React.FC<UserProfileProps> = ({
    isOpen,
    onClose,
    settings,
    onUpdateSettings
}) => {
    const [nameInput, setNameInput] = useState(settings.userName || '')

    if (!isOpen) return null

    const handleSave = () => {
        onUpdateSettings({ userName: nameInput || 'Local AI User' })
        onClose()
    }

    return (
        <div className="user-profile-overlay" id="user-profile-modal">
            <div className="user-profile animate-scaleIn">
                <header className="user-profile__header">
                    <h2 className="user-profile__title">User Profile</h2>
                    <button className="user-profile__close" onClick={onClose} id="user-profile-close">
                        <X size={20} />
                    </button>
                </header>

                <div className="user-profile__content">
                    <div className="user-profile__avatar-section">
                        <div className="user-profile__avatar-large">
                            <User size={48} color="var(--accent-primary)" />
                        </div>
                    </div>

                    <div className="user-profile__form">
                        <div className="user-profile__field">
                            <label htmlFor="user-name-input">Display Name</label>
                            <input
                                id="user-name-input"
                                type="text"
                                className="user-profile__input"
                                value={nameInput}
                                onChange={(e) => setNameInput(e.target.value)}
                                placeholder="Enter your name"
                                autoComplete="off"
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                                autoFocus
                            />
                            <p className="user-profile__hint">This name will be displayed in the sidebar and chat interface.</p>
                        </div>
                    </div>
                </div>

                <div className="user-profile__footer">
                    <button className="user-profile__btn" onClick={onClose}>Cancel</button>
                    <button className="user-profile__btn user-profile__btn--primary" onClick={handleSave}>
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}
