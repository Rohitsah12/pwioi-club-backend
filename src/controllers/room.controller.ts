import type { Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { catchAsync } from "../utils/catchAsync.js";
import { AppError } from "../utils/AppError.js";
import { z } from "zod";

const createRoomSchema = z.object({
  name: z.string().min(1, "Room name is required").max(100, "Room name too long"),
  center_id: z.string().min(1, "Center ID is required")
});

const updateRoomSchema = z.object({
  name: z.string().min(1, "Room name is required").max(100, "Room name too long").optional(),
  center_id: z.string().min(1, "Center ID is required").optional()
});

export const createRoom = catchAsync(async (req: Request, res: Response) => {
  const validation = createRoomSchema.safeParse(req.body);
  
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.error.format()
    });
  }

  const { name, center_id } = validation.data;

  // Check if center exists
  const center = await prisma.center.findUnique({
    where: { id: center_id }
  });

  if (!center) {
    throw new AppError("Center not found", 404);
  }

  // Check if room with same name already exists in this center
  const existingRoom = await prisma.room.findFirst({
    where: {
      name: name.trim(),
      center_id
    }
  });

  if (existingRoom) {
    throw new AppError("Room with this name already exists in this center", 409);
  }

  const room = await prisma.room.create({
    data: {
      name: name.trim(),
      center_id
    },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true
        }
      },
      _count: {
        select: {
          beacons: true,
          classes: true
        }
      }
    }
  });

  res.status(201).json({
    success: true,
    message: "Room created successfully",
    data: room
  });
});

export const getRooms = catchAsync(async (req: Request, res: Response) => {
  const { name, center_id } = req.query;

  const whereClause: any = {};
  
  if (name) {
    whereClause.name = { 
      contains: name as string, 
      mode: 'insensitive' 
    };
  }

  if (center_id) {
    whereClause.center_id = center_id as string;
  }

  const [rooms, totalCount] = await Promise.all([
    prisma.room.findMany({
      where: whereClause,
      include: {
        center: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true
          }
        },
        _count: {
          select: {
            beacons: true,
            classes: true
          }
        }
      },
      orderBy: { name: 'asc' },
    }),
    prisma.room.count({ where: whereClause })
  ]);

  res.status(200).json({
    success: true,
    count: rooms.length,
    totalCount,
    data: rooms
  });
});

export const getRoomsByCenter = catchAsync(async (req: Request, res: Response) => {
  const { centerId } = req.params;
  const { name } = req.query;

  if (!centerId) {
    throw new AppError("Center ID is required", 400);
  }

  // Check if center exists
  const center = await prisma.center.findUnique({
    where: { id: centerId }
  });

  if (!center) {
    throw new AppError("Center not found", 404);
  }

  const whereClause: any = {
    center_id: centerId
  };
  
  if (name) {
    whereClause.name = { 
      contains: name as string, 
      mode: 'insensitive' 
    };
  }

  const [rooms, totalCount] = await Promise.all([
    prisma.room.findMany({
      where: whereClause,
      include: {
        center: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true
          }
        },
        _count: {
          select: {
            beacons: true,
            classes: true
          }
        }
      },
      orderBy: { name: 'asc' },
    }),
    prisma.room.count({ where: whereClause })
  ]);

  res.status(200).json({
    success: true,
    count: rooms.length,
    totalCount,
    center: {
      id: center.id,
      name: center.name,
      code: center.code,
      location: center.location
    },
    data: rooms
  });
});

export const getRoomById = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;

  if (!roomId) {
    throw new AppError("Room ID is required", 400);
  }

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true
        }
      },
      beacons: {
        orderBy: [
          { major: 'asc' },
          { minor: 'asc' }
        ]
      },
      classes: {
        include: {
          subject: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          teacher: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          division: {
            select: {
              id: true,
              code: true
            }
          }
        },
        orderBy: { start_date: 'desc' },
        take: 10 // Get latest 10 classes for this room
      },
      _count: {
        select: {
          beacons: true,
          classes: true
        }
      }
    }
  });

  if (!room) {
    throw new AppError("Room not found", 404);
  }

  res.status(200).json({
    success: true,
    data: room
  });
});

export const updateRoom = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;

  if (!roomId) {
    throw new AppError("Room ID is required", 400);
  }

  const validation = updateRoomSchema.safeParse(req.body);
  
  if (!validation.success) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: validation.error.format()
    });
  }

  // Check if room exists
  const existingRoom = await prisma.room.findUnique({
    where: { id: roomId }
  });

  if (!existingRoom) {
    throw new AppError("Room not found", 404);
  }

  const { name, center_id } = validation.data;

  // If updating center_id, check if center exists
  if (center_id) {
    const center = await prisma.center.findUnique({
      where: { id: center_id }
    });

    if (!center) {
      throw new AppError("Center not found", 404);
    }
  }

  // If updating name, check for duplicates within the same center
  if (name) {
    const finalCenterId = center_id || existingRoom.center_id;
    
    const duplicateRoom = await prisma.room.findFirst({
      where: {
        name: name.trim(),
        center_id: finalCenterId,
        id: { not: roomId }
      }
    });

    if (duplicateRoom) {
      throw new AppError("Room with this name already exists in this center", 409);
    }
  }

  const updatedRoom = await prisma.room.update({
    where: { id: roomId },
    data: {
      ...(name && { name: name.trim() }),
      ...(center_id && { center_id })
    },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true
        }
      },
      _count: {
        select: {
          beacons: true,
          classes: true
        }
      }
    }
  });

  res.status(200).json({
    success: true,
    message: "Room updated successfully",
    data: updatedRoom
  });
});

export const deleteRoom = catchAsync(async (req: Request, res: Response) => {
  const { roomId } = req.params;

  if (!roomId) {
    throw new AppError("Room ID is required", 400);
  }

  const existingRoom = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      center: {
        select: {
          id: true,
          name: true,
          code: true,
          location: true
        }
      },
      _count: {
        select: {
          beacons: true,
          classes: true
        }
      }
    }
  });

  if (!existingRoom) {
    throw new AppError("Room not found", 404);
  }

  if (existingRoom._count.beacons > 0) {
    throw new AppError(
      `Cannot delete room. It has ${existingRoom._count.beacons} associated beacon(s). Please remove beacons first.`, 
      409
    );
  }

  if (existingRoom._count.classes > 0) {
    throw new AppError(
      `Cannot delete room. It has ${existingRoom._count.classes} associated class(es). Please reassign classes first.`, 
      409
    );
  }

  await prisma.room.delete({
    where: { id: roomId }
  });

  res.status(200).json({
    success: true,
    message: "Room deleted successfully",
    data: {
      id: existingRoom.id,
      name: existingRoom.name,
      center: existingRoom.center
    }
  });
});