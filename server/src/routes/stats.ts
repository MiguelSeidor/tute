import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../db/client.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// GET /api/stats/ranking — Top 20 players by wins
router.get('/ranking', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const ranking = await prisma.$queryRaw<
      { userId: string; username: string; elo: number; wins: bigint; gamesPlayed: bigint }[]
    >`
      SELECT gp."userId", u.username, u.elo,
        COUNT(*) FILTER (WHERE gp."isWinner" = true) AS wins,
        COUNT(*) AS "gamesPlayed"
      FROM game_players gp
      JOIN users u ON u.id = gp."userId"
      GROUP BY gp."userId", u.username, u.elo
      ORDER BY u.elo DESC, wins DESC
      LIMIT 20
    `;

    res.json({
      ranking: ranking.map(r => ({
        userId: r.userId,
        username: r.username,
        wins: Number(r.wins),
        gamesPlayed: Number(r.gamesPlayed),
        winRate: Number(r.gamesPlayed) > 0
          ? Math.round((Number(r.wins) / Number(r.gamesPlayed)) * 100)
          : 0,
        elo: r.elo,
      })),
    });
  } catch (error) {
    console.error('Error en ranking:', error);
    res.status(500).json({ error: 'Error al obtener ranking' });
  }
});

// GET /api/stats/history — Game history for authenticated user
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const myGames = await prisma.gamePlayer.findMany({
      where: { userId },
      orderBy: { game: { completedAt: 'desc' } },
      take: 20,
      include: {
        game: {
          include: {
            players: {
              include: { user: { select: { username: true } } },
            },
          },
        },
      },
    });

    res.json({
      games: myGames.map(gp => {
        const startMs = gp.game.startedAt.getTime();
        const endMs = gp.game.completedAt.getTime();
        const durationMinutes = Math.round((endMs - startMs) / 60000);
        return {
          id: gp.game.id,
          roomName: gp.game.roomName,
          piedrasCount: gp.game.piedrasCount,
          startedAt: gp.game.startedAt.toISOString(),
          completedAt: gp.game.completedAt.toISOString(),
          durationMinutes,
          players: gp.game.players.map(p => ({
            username: p.user.username,
            isWinner: p.isWinner,
            finalPiedras: p.finalPiedras,
            totalPuntos: p.totalPuntos,
            bazasGanadas: p.bazasGanadas,
          })),
          myResult: gp.isWinner ? 'win' as const : 'loss' as const,
          myStats: {
            totalPuntos: gp.totalPuntos,
            bazasGanadas: gp.bazasGanadas,
            cantes20: gp.cantes20,
            cantes40: gp.cantes40,
            tutes: gp.tutes,
            vecesIrADos: gp.vecesIrADos,
            eloChange: gp.eloAfter - gp.eloBefore,
          },
        };
      }),
    });
  } catch (error) {
    console.error('Error en history:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// GET /api/stats/me — Personal stats for authenticated user
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const [allGames, user, aggregates] = await Promise.all([
      prisma.gamePlayer.findMany({
        where: { userId },
        orderBy: { game: { completedAt: 'desc' } },
        select: { isWinner: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { elo: true },
      }),
      prisma.gamePlayer.aggregate({
        where: { userId },
        _sum: {
          totalPuntos: true,
          bazasGanadas: true,
          cantes20: true,
          cantes40: true,
          tutes: true,
          vecesIrADos: true,
        },
      }),
    ]);

    const gamesPlayed = allGames.length;
    const wins = allGames.filter(g => g.isWinner).length;
    const losses = gamesPlayed - wins;
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

    // Current streak and best streak
    let currentStreak = 0;
    for (const g of allGames) {
      if (g.isWinner) currentStreak++;
      else break;
    }

    let bestStreak = 0;
    let streak = 0;
    for (const g of allGames) {
      if (g.isWinner) {
        streak++;
        if (streak > bestStreak) bestStreak = streak;
      } else {
        streak = 0;
      }
    }

    const totalPuntos = aggregates._sum.totalPuntos ?? 0;

    res.json({
      stats: {
        gamesPlayed, wins, losses, winRate, currentStreak, bestStreak,
        elo: user?.elo ?? 1000,
        totalPuntos,
        totalBazas: aggregates._sum.bazasGanadas ?? 0,
        totalCantes20: aggregates._sum.cantes20 ?? 0,
        totalCantes40: aggregates._sum.cantes40 ?? 0,
        totalTutes: aggregates._sum.tutes ?? 0,
        totalIrADos: aggregates._sum.vecesIrADos ?? 0,
        avgPuntosPerGame: gamesPlayed > 0 ? Math.round(totalPuntos / gamesPlayed) : 0,
      },
    });
  } catch (error) {
    console.error('Error en stats/me:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// POST /api/stats/dev/simulate — Inserta una partida ficticia para testing (solo desarrollo)
router.post('/dev/simulate', authMiddleware, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'No disponible en producción' });
    return;
  }
  try {
    const userId = req.userId!;

    // Coger todos los usuarios registrados (hasta 4)
    const allUsers = await prisma.user.findMany({ take: 4, select: { id: true, username: true } });
    if (allUsers.length < 1) {
      res.status(400).json({ error: 'No hay usuarios registrados' });
      return;
    }

    // Rellenar hasta 4 jugadores (repitiendo el actual si hace falta)
    const me = allUsers.find(u => u.id === userId) || allUsers[0];
    while (allUsers.length < 4) {
      allUsers.push(me);
    }

    // Decidir ganador aleatorio (el usuario actual gana el 60% de las veces)
    const winnerIdx = Math.random() < 0.6 ? allUsers.findIndex(u => u.id === userId) : Math.floor(Math.random() * 4);

    await prisma.game.create({
      data: {
        roomName: `Test ${Date.now().toString(36)}`,
        piedrasCount: 5,
        players: {
          create: allUsers.map((u, i) => ({
            userId: u.id,
            seat: i,
            finalPiedras: i === winnerIdx ? 3 : 0,
            isWinner: i === winnerIdx,
          })),
        },
      },
    });

    res.json({ message: `Partida simulada. Ganador: ${allUsers[winnerIdx].username}` });
  } catch (error) {
    console.error('Error simulando partida:', error);
    res.status(500).json({ error: 'Error al simular partida' });
  }
});

export default router;
