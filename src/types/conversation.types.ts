export interface Conversation {
    id: string
    title: string
    createdAt: number
    updatedAt: number
    messageCount: number
}

export type ConversationListItem = Pick<Conversation, 'id' | 'title' | 'updatedAt' | 'messageCount'>
