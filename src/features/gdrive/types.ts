export interface GDriveUser {
  displayName: string
  emailAddress: string
  photoLink?: string
}

export interface GDriveFile {
  id: string
  name: string
  mimeType: string
  thumbnailLink?: string
  webViewLink: string
  modifiedTime: string
  sharedWithMeTime?: string
  viewedByMeTime?: string
  sharingUser?: GDriveUser
  owners?: GDriveUser[]
}

export type DriveSection = 'my-drive' | 'shared' | 'recent' | 'starred'

