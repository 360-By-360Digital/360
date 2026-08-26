## credit to @GreatesSoup
#!/usr/bin/env python3
import curses
import random
import time

WIDTH, HEIGHT = 60, 22
WORLD_HEIGHT = 40

AIR = " "
DIRT = "."
STONE = "#"
COAL = "C"
IRON = "I"
DIAMOND = "D"
BEDROCK = "B"

BLOCKS = [STONE, COAL, IRON, DIAMOND]

ORE_PROBS = [
    (DIAMOND, 0.01),
    (IRON, 0.06),
    (COAL, 0.12),
]

class Player:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.vx = 0
        self.vy = 0
        self.facing = (0, 1)  # default facing down
        self.inv = {DIAMOND: 0, IRON: 0, COAL: 0}
        self.char = "@"

def make_world():
    world = []
    for y in range(WORLD_HEIGHT):
        row = []
        for x in range(WIDTH):
            if y < 3:
                row.append(AIR)
            elif y < 6:
                row.append(DIRT)
            elif y < WORLD_HEIGHT - 1:
                # stone + ores
                r = random.random()
                block = STONE
                for ore, p in ORE_PROBS:
                    if r < p:
                        block = ore
                        break
                row.append(block)
            else:
                row.append(BEDROCK)
        world.append(row)
    return world

def in_bounds(x, y):
    return 0 <= x < WIDTH and 0 <= y < WORLD_HEIGHT

def is_solid(block):
    return block not in (AIR,)

def draw_world(stdscr, world, player, cam_y):
    for sy in range(HEIGHT):
        wy = cam_y + sy
        if 0 <= wy < WORLD_HEIGHT:
            for x in range(WIDTH):
                ch = world[wy][x]
                stdscr.addch(sy, x, ch)
        else:
            for x in range(WIDTH):
                stdscr.addch(sy, x, " ")

    # draw player
    py_screen = player.y - cam_y
    if 0 <= py_screen < HEIGHT:
        stdscr.addch(py_screen, player.x, player.char)

def draw_hud(stdscr, player, cam_y):
    hud_y = HEIGHT
    depth = player.y
    inv_str = f"D:{player.inv[DIAMOND]} I:{player.inv[IRON]} C:{player.inv[COAL]}"
    info = f"Depth:{depth}  Inv[{inv_str}]  Arrows: move  Space: mine  q: quit"
    stdscr.addstr(hud_y, 0, info[:WIDTH])

def apply_gravity(world, player):
    below_y = player.y + 1
    if below_y < WORLD_HEIGHT and not is_solid(world[below_y][player.x]):
        player.y += 1

def mine_block(world, player):
    dx, dy = player.facing
    tx = player.x + dx
    ty = player.y + dy
    if not in_bounds(tx, ty):
        return
    block = world[ty][tx]
    if block in player.inv:
        player.inv[block] += 1
    if block != BEDROCK:
        world[ty][tx] = AIR

def handle_input(world, player, key):
    if key == curses.KEY_LEFT:
        nx = player.x - 1
        player.facing = (-1, 0)
        if in_bounds(nx, player.y) and not is_solid(world[player.y][nx]):
            player.x = nx
    elif key == curses.KEY_RIGHT:
        nx = player.x + 1
        player.facing = (1, 0)
        if in_bounds(nx, player.y) and not is_solid(world[player.y][nx]):
            player.x = nx
    elif key == curses.KEY_UP:
        ny = player.y - 1
        player.facing = (0, -1)
        if in_bounds(player.x, ny) and not is_solid(world[ny][player.x]):
            player.y = ny
    elif key == curses.KEY_DOWN:
        ny = player.y + 1
        player.facing = (0, 1)
        if in_bounds(player.x, ny) and not is_solid(world[ny][player.x]):
            player.y = ny
    elif key == ord(" "):
        mine_block(world, player)

def main(stdscr):
    curses.curs_set(0)
    stdscr.nodelay(True)
    stdscr.keypad(True)

    world = make_world()
    player = Player(WIDTH // 2, 2)
    cam_y = 0
    last_tick = time.time()
    tick_rate = 0.05

    while True:
        now = time.time()
        if now - last_tick < tick_rate:
            time.sleep(0.01)
            continue
        last_tick = now

        stdscr.clear()

        # camera follows player vertically
        cam_y = max(0, min(player.y - HEIGHT // 2, WORLD_HEIGHT - HEIGHT))

        draw_world(stdscr, world, player, cam_y)
        draw_hud(stdscr, player, cam_y)
        stdscr.refresh()

        try:
            key = stdscr.getch()
        except KeyboardInterrupt:
            break

        if key == ord("q"):
            break
        if key != -1:
            handle_input(world, player, key)

        apply_gravity(world, player)

if __name__ == "__main__":
    curses.wrapper(main)
