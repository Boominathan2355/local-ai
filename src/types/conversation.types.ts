export interface Conversation {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messageCount: number
    enabledToolCategories?: string[]
    isGenerating?: boolean
}

export type ConversationListItem = Pick<Conversation, 'id' | 'title' | 'updatedAt' | 'messageCount' | 'isGenerating'>
