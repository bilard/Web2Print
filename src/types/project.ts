export interface ProjectData {
  id: string
  title: string
  thumbnail: string | null
  createdAt: number
  updatedAt: number
  ownerId: string
  canvasData: string | null
}
