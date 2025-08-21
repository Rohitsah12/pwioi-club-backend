export interface Room {
  id: string;
  name: string;
  center_id: string;
  createdAt: Date;
  updatedAt: Date;
  center?: {
    id: string;
    name: string;
    code: number;
    location: string;
  };
  _count?: {
    beacons: number;
    classes: number;
  };
  beacons?: Beacon[];
  classes?: Class[];
}

export interface CreateRoomRequest {
  name: string;
  center_id: string;
}

export interface UpdateRoomRequest {
  name?: string;
  center_id?: string;
}

export interface Beacon {
  id: string;
  major: number;
  minor: number;
  room_id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Class {
  id: string;
  lecture_number: string;
  subject_id: string;
  division_id: string;
  teacher_id: string;
  room_id: string;
  start_date: Date;
  end_date: Date;
  createdAt: Date;
  updatedAt: Date;
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  teacher?: {
    id: string;
    name: string;
    email: string;
  };
  division?: {
    id: string;
    code: string;
  };
}