export interface NASAImage {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  copyright?: string;
  thumbnail_url?: string;
  service_version?: string;
}

export interface StarredImage {
  date: string;
  title: string;
  url: string;
  hdurl?: string;
}

export enum SortOrder {
  DateDesc = "date-desc",
  DateAsc = "date-asc",
}
