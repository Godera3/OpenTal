/*
Rodent, a UCI chess playing engine derived from Sungorus 1.4
Copyright (C) 2009-2011 Pablo Vazquez (Sungorus author)
Copyright (C) 2011-2017 Pawel Koziol

Rodent is free software: you can redistribute it and/or modify it under the terms of the GNU
General Public License as published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

Rodent is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without
even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.
If not, see <http://www.gnu.org/licenses/>.
*/

#include "rodent.h"
#include "eval.h"
#include <cstdio>
#include <cstring>
#include <cmath> // round

void cEngine::ClearAll() {

    ClearPawnHash();
    ClearEvalHash();
    ClearHist();
}

void cEngine::ClearEvalHash() {

    ZEROARRAY(mEvalTT);
}

void cEngine::EvaluateMaterial(POS *p, eData *e, eColor sd) {

    eColor op = ~sd;

    int tmp = Par.np_table[p->mCnt[sd][P]] * p->mCnt[sd][N]    // knights lose value as pawns disappear
            - Par.rp_table[p->mCnt[sd][P]] * p->mCnt[sd][R];   // rooks gain value as pawns disappear

    if (p->mCnt[sd][N] > 1) tmp += Par.values[N_PAIR];        // knight pair
    if (p->mCnt[sd][R] > 1) tmp += Par.values[R_PAIR];        // rook pair
    if (p->mCnt[sd][B] > 1) tmp += Par.values[B_PAIR];        // bishop pair

    // "elephantiasis correction" for queen, idea by H.G.Mueller (nb. rookVsQueen doesn't help)

    if (p->mCnt[sd][Q])
        tmp -= Par.values[ELEPH] * (p->mCnt[op][N] + p->mCnt[op][B]);

    Add(e, sd, tmp);
}

void cEngine::EvaluatePieces(POS *p, eData *e, eColor sd) {

    U64 bb_pieces, bb_attack, bb_control, bb_possible, bb_contact, bb_zone, bb_file;
    int sq, cnt, own_p_cnt, opp_p_cnt;
    int r_on_7th = 0;
    int mob_mg = 0;
    int mob_eg = 0;
    int tropism_mg = 0;
    int tropism_eg = 0;
    int lines_mg = 0;
    int lines_eg = 0;
    int fwd_weight = 0;
    int fwd_cnt = 0;
    int outpost = 0;
    int center_control = 2 * BB.PopCnt(e->p_takes[sd] & Mask.center);

    // Init king attack zone

    eColor op = ~sd;
    int king_sq = p->KingSq(op);
    bb_zone = BB.KingAttacks(king_sq);
    bb_zone |= BB.ShiftFwd(bb_zone, op);

    // Init helper bitboards

    U64 n_checks = BB.KnightAttacks(king_sq) & ~p->mClBb[sd] & ~e->p_takes[op];
    U64 b_checks = BB.BishAttacks(p->OccBb(), king_sq) & ~p->mClBb[sd] & ~e->p_takes[op];
    U64 r_checks = BB.RookAttacks(p->OccBb(), king_sq) & ~p->mClBb[sd] & ~e->p_takes[op];
    U64 q_checks = r_checks & b_checks;
    U64 bb_excluded = p->Pawns(sd);

    // Knight eval

    bb_pieces = p->Knights(sd);
    while (bb_pieces) {
        sq = BB.PopFirstBit(&bb_pieces);                    // get square

        // knight tropism to enemy king (based on Gambit Fruit)

        tropism_mg += Par.values[NTR_MG] * Dist.bonus[sq][king_sq];
        tropism_eg += Par.values[NTR_EG] * Dist.bonus[sq][king_sq];

        if (SqBb(sq) & Mask.away[sd]) {                     // forwardness (based on Toga II 3.0)
            fwd_weight += Par.values[N_FWD];
            fwd_cnt += 1;
        }

        bb_control = BB.KnightAttacks(sq) & ~p->mClBb[sd];  // get control bitboard
        center_control += BB.PopCnt(bb_control & Mask.center);
        if (!(bb_control  & ~e->p_takes[op] & Mask.away[sd])) // we do not attack enemy half of the board
            Add(e, sd, Par.values[N_OWH]);
        e->all_att[sd] |= BB.KnightAttacks(sq);
        e->ev_att[sd]  |= bb_control;
        if (bb_control & n_checks) e->att[sd] += Par.values[N_CHK];// check threats

        bb_possible = bb_control & ~e->p_takes[op];         // reachable outposts
        bb_possible &= ~e->p_can_take[op];
        bb_possible &= Mask.outpost_map[sd];
        if (bb_possible) Add(e, sd, Par.values[N_REACH], 2);

        bb_attack = BB.KnightAttacks(sd);
        if (bb_attack & bb_zone) {                          // king attack
            e->wood[sd]++;
            e->att[sd] += Par.values[N_ATT1] * BB.PopCnt(bb_attack & (bb_zone & ~e->p_takes[op]));
            e->att[sd] += Par.values[N_ATT2] * BB.PopCnt(bb_attack & (bb_zone & e->p_takes[op]));
        }

        cnt = BB.PopCnt(bb_control & ~e->p_takes[op]);      // get mobility count
        mob_mg += Par.n_mob_mg[cnt];
        mob_eg += Par.n_mob_eg[cnt];

        EvaluateOutpost(p, e, sd, N, sq, &outpost);         // outpost
    }

    // Bishop eval

    bb_pieces = p->Bishops(sd);
    while (bb_pieces) {
        sq = BB.PopFirstBit(&bb_pieces);                    // get square

        // bishop tropism  to enemy king (based on Gambit Fruit)

        tropism_mg += Par.values[BTR_MG] * Dist.bonus[sq][king_sq];
        tropism_eg += Par.values[BTR_EG] * Dist.bonus[sq][king_sq];

        if (SqBb(sq) & Mask.away[sd]) {                     // forwardness (based on Toga II 3.0)
            fwd_weight += Par.values[B_FWD];
            fwd_cnt += 1;
        }

        bb_control = BB.BishAttacks(p->OccBb(), sq);        // get control bitboard
        center_control += BB.PopCnt(bb_control & Mask.center);
        e->all_att[sd] |= bb_control;                       // update attack map
        e->ev_att[sd]  |= bb_control;
        if (!(bb_control & Mask.away[sd]))
             Add(e, sd, Par.values[B_OWH]);                 // we do not attack enemy half of the board
        if (bb_control & b_checks) e->att[sd] += Par.values[B_CHK];// check threats

        bb_attack = BB.BishAttacks(p->OccBb() ^ p->Queens(sd), sq);  // get king attack bitboard

        if (bb_attack & bb_zone) {                          // evaluate king attacks
            e->wood[sd]++;
            e->att[sd] += Par.values[B_ATT1] * BB.PopCnt(bb_attack & (bb_zone & ~e->p_takes[op]));
            e->att[sd] += Par.values[B_ATT2] * BB.PopCnt(bb_attack & (bb_zone & e->p_takes[op]));
        }

        cnt = BB.PopCnt(bb_control & ~e->p_takes[op] & ~bb_excluded); // get mobility count
        mob_mg += Par.b_mob_mg[cnt];
        mob_eg += Par.b_mob_eg[cnt];

        bb_possible = bb_control & ~e->p_takes[op];         // reachable outposts
        bb_possible &= ~e->p_can_take[op];
        bb_possible &= Mask.outpost_map[sd];
        if (bb_possible) Add(e, sd, Par.values[B_REACH], 2);

        EvaluateOutpost(p, e, sd, B, sq, &outpost);         // outpost

        // Bishops side by side

        if (ShiftNorth(SqBb(sq)) & p->Bishops(sd))
            Add(e, sd, Par.values[B_TOUCH]);
        if (ShiftEast(SqBb(sq)) & p->Bishops(sd))
            Add(e, sd, Par.values[B_TOUCH]);

        // Pawns on the same square color as our bishop

        if (bbWhiteSq & SqBb(sq)) {
            own_p_cnt = BB.PopCnt(bbWhiteSq & p->Pawns(sd)) - 4;
            opp_p_cnt = BB.PopCnt(bbWhiteSq & p->Pawns(op)) - 4;
        } else {
            own_p_cnt = BB.PopCnt(bbBlackSq & p->Pawns(sd)) - 4;
            opp_p_cnt = BB.PopCnt(bbBlackSq & p->Pawns(op)) - 4;
        }

        Add(e, sd, Par.values[B_OWN_P] * own_p_cnt
                 + Par.values[B_OPP_P] * opp_p_cnt);
    }

    // Rook eval

    bb_pieces = p->Rooks(sd);
    while (bb_pieces) {
        sq = BB.PopFirstBit(&bb_pieces);                    // get square

        // rook tropism to enemy king (based on Gambit Fruit)

        tropism_mg += Par.values[RTR_MG] * Dist.bonus[sq][king_sq];
        tropism_eg += Par.values[RTR_EG] * Dist.bonus[sq][king_sq];

        if (SqBb(sq) & Mask.away[sd]) {                     // forwardness (based on Toga II 3.0)
            fwd_weight += Par.values[R_FWD];
            fwd_cnt += 1;
        }

        bb_control = BB.RookAttacks(p->OccBb(), sq);        // get control bitboard
        e->all_att[sd] |= bb_control;                       // update attack map
        e->ev_att[sd] |= bb_control;

        if ((bb_control & ~p->mClBb[sd] & r_checks)
        && p->Queens(sd)) {
            e->att[sd] += Par.values[R_CHK];                       // check threat bonus
            bb_contact = (bb_control & BB.KingAttacks(king_sq)) & r_checks;  // get contact check bitboard

            while (bb_contact) {
                int contactSq = BB.PopFirstBit(&bb_contact);    // find a potential contact check
                if (p->Swap(sq, contactSq) >= 0) {              // rook exchanges are also accepted
                    e->att[sd] += Par.values[R_CONTACT];
                    break;
                }
            }
        }

        bb_attack = BB.RookAttacks(p->OccBb() ^ p->StraightMovers(sd), sq);// get king attack bitboard

        if (bb_attack & bb_zone) {                                         // evaluate king attacks
            e->wood[sd]++;
            e->att[sd] += Par.values[R_ATT1] * BB.PopCnt(bb_attack & (bb_zone & ~e->p_takes[op]));
            e->att[sd] += Par.values[R_ATT2] * BB.PopCnt(bb_attack & (bb_zone & e->p_takes[op]));
        }

        cnt = BB.PopCnt(bb_control & ~bb_excluded);                        // get mobility count
        mob_mg += Par.r_mob_mg[cnt];
        mob_eg += Par.r_mob_eg[cnt];

        // FILE EVALUATION:

        bb_file = BB.FillNorth(SqBb(sq)) | BB.FillSouth(SqBb(sq));   // get file

        if (bb_file & p->Queens(op)) {                      // enemy queen on rook's file
            lines_mg += Par.values[ROQ_MG];
            lines_eg += Par.values[ROQ_EG];
        }

        if (!(bb_file & p->Pawns(sd))) {                    // no own pawns on that file
            if (!(bb_file & p->Pawns(op))) {
                lines_mg += Par.values[ROF_MG];
                lines_eg += Par.values[ROF_EG];
            } else {                                             // half-open file...
                if (bb_file & (p->Pawns(op) & e->p_takes[op])) { // ...with defended enemy pawn
                    lines_mg += Par.values[RBH_MG];
                    lines_eg += Par.values[RBH_EG];
                } else {                                         // ...with undefended enemy pawn
                    lines_mg += Par.values[RGH_MG];
                    lines_eg += Par.values[RGH_EG];
                }
            }
        }

        // Rook on the 7th rank attacking pawns or cutting off enemy king

        if (SqBb(sq) & bb_rel_rank[sd][RANK_7]) {                // rook on 7th rank
            if (p->Pawns(op) & bb_rel_rank[sd][RANK_7]           // attacking enemy pawns
            ||  p->Kings(op) & bb_rel_rank[sd][RANK_8]) {        // or cutting off enemy king
                lines_mg += Par.values[RSR_MG];
                lines_eg += Par.values[RSR_EG];
                r_on_7th++;
            }
        }
    }

    // Queen eval

    bb_pieces = p->Queens(sd);
    while (bb_pieces) {
        sq = BB.PopFirstBit(&bb_pieces);                    // get square

        // queen tropism to enemy king (based on Gambit Fruit)

        tropism_mg += Par.values[QTR_MG] * Dist.bonus[sq][king_sq];
        tropism_eg += Par.values[QTR_EG] * Dist.bonus[sq][king_sq];

        if (SqBb(sq) & Mask.away[sd]) {                     // forwardness (based on Toga II 3.0)
            fwd_weight += Par.values[Q_FWD];
            fwd_cnt += 1;
        }

        bb_control = BB.QueenAttacks(p->OccBb(), sq);       // get control bitboard
        e->all_att[sd] |= bb_control;                       // update attack map
        if (bb_control & q_checks) {                        // check threat bonus
            e->att[sd] += Par.values[Q_CHK];

            bb_contact = bb_control & BB.KingAttacks(king_sq);  // queen contact checks
            while (bb_contact) {
                int contactSq = BB.PopFirstBit(&bb_contact);    // find potential contact check square
                if (p->Swap(sq, contactSq) >= 0) {              // if check doesn't lose material, evaluate
                    e->att[sd] += Par.values[Q_CONTACT];
                    break;
                }
            }
        }

        bb_attack  = BB.BishAttacks(p->OccBb() ^ p->DiagMovers(sd), sq);
        bb_attack |= BB.RookAttacks(p->OccBb() ^ p->StraightMovers(sd), sq);

        if (bb_attack & bb_zone) {                          // evaluate king attacks
            e->wood[sd]++;
            e->att[sd] += Par.values[Q_ATT1] * BB.PopCnt(bb_attack & (bb_zone & ~e->p_takes[op]));
            e->att[sd] += Par.values[Q_ATT2] * BB.PopCnt(bb_attack & (bb_zone & e->p_takes[op]));
        }

        cnt = BB.PopCnt(bb_control & ~bb_excluded);         // get mobility count
        mob_mg += Par.q_mob_mg[cnt];
        mob_eg += Par.q_mob_eg[cnt];

        if (SqBb(sq) & bb_rel_rank[sd][RANK_7]) {           // queen on 7th rank
            if (p->Pawns(op) & bb_rel_rank[sd][RANK_7]      // attacking enemy pawns
            ||  p->Kings(op) & bb_rel_rank[sd][RANK_8]) {   // or cutting off enemy king
                lines_mg += Par.values[QSR_MG];
                lines_eg += Par.values[QSR_EG];
            }
        }
    } // end of queen eval

    // Composite factors

    if (r_on_7th > 1) {  // two rooks on 7th rank
        lines_mg += Par.values[RS2_MG];
        lines_eg += Par.values[RS2_EG];
    }

    // Weighting eval parameters

    Add(e, sd, (Par.sd_mob[sd] * mob_mg)  / 100, (Par.sd_mob[sd] * mob_eg)  / 100);
    Add(e, sd, (Par.values[W_TROPISM] * tropism_mg) / 100, (Par.values[W_TROPISM] * tropism_eg) / 100);
    Add(e, sd, (Par.values[W_LINES] * lines_mg)     / 100, (Par.values[W_LINES] * lines_eg)     / 100);
    Add(e, sd, (Par.values[W_FWD] * fwd_bonus[fwd_cnt] * fwd_weight) / 100, 0);
    Add(e, sd, (Par.values[W_OUTPOSTS] * outpost) / 100);
    Add(e, sd, (Par.values[W_CENTER] * center_control) / 100, 0);

}

void cEngine::EvaluateKingAttack(POS *p, eData *e, eColor sd) {

    if (e->wood[sd] > 1) {
        if (e->att[sd] > 399) e->att[sd] = 399;
        if (p->mCnt[sd][Q] == 0) e->att[sd] = 0;
        Add(e, sd, (Par.danger[e->att[sd]] * Par.sd_att[sd]) / 100);
    }

}

void cEngine::EvaluateOutpost(POS *p, eData *e, eColor sd, int pc, int sq, int *outpost) {

    if (SqBb(sq) & Mask.home[sd]) {
        U64 stop = BB.ShiftFwd(SqBb(sq), sd);             // get square in front of a minor
        if (stop & p->Pawns(sd))                          // is it occupied by own pawn?
            *outpost += Par.values[BN_SHIELD];            // bonus for a pawn shielding a minor
    }

    int tmp = Par.sp_pst[sd][pc][sq];                     // get base outpost bonus
    if (tmp) {
        int mul = 0;                                      // reset outpost multiplier
        if (SqBb(sq) & ~e->p_can_take[~sd]) mul += 2; // is piece in hole of enemy pawn structure?
        if (SqBb(sq) & e->p_takes[sd]) mul += 1;          // is piece defended by own pawn?
        if (SqBb(sq) & e->two_pawns_take[sd]) mul += 1;   // is piece defended by two pawns?
        *outpost += (tmp * mul) / 2;                      // add outpost bonus
    }
}

void cEngine::EvaluatePawns(POS *p, eData *e, eColor sd) {

    U64 bb_pieces, front_span, fl_phalanx, fl_defended;
    int sq, fl_unopposed;
    eColor op = ~sd;
    int mass_mg = 0;
    int mass_eg = 0;

    bb_pieces = p->Pawns(sd);
    while (bb_pieces) {

        // Set data and flags

        sq = BB.PopFirstBit(&bb_pieces);
        front_span = BB.GetFrontSpan(SqBb(sq), sd);
        fl_unopposed = ((front_span & p->Pawns(op)) == 0);
        fl_phalanx = (BB.ShiftSideways(SqBb(sq)) & p->Pawns(sd));
        fl_defended = (SqBb(sq) & e->p_takes[sd]);

        // Candidate passers

        if (fl_unopposed) {
            if (fl_phalanx || fl_defended) {
                if (BB.PopCnt((Mask.passed[sd][sq] & p->Pawns(op))) == 1)
                    AddPawns(e, sd, Par.cand_bonus_mg[sd][Rank(sq)], Par.cand_bonus_eg[sd][Rank(sq)]);
            }
        }

        // Doubled pawn

        if (front_span & p->Pawns(sd))
            AddPawns(e, sd, Par.values[DB_MID], Par.values[DB_END]);

        // Supported pawn

        if (fl_phalanx) {
            mass_mg += Par.sp_pst[sd][PHA_MG][sq];
            mass_eg += Par.sp_pst[sd][PHA_EG][sq];
        }
        else if (fl_defended) {
            mass_mg += Par.sp_pst[sd][DEF_MG][sq];
            mass_eg += Par.sp_pst[sd][DEF_EG][sq];
        }

        // Isolated and weak pawn

        if (!(Mask.adjacent[File(sq)] & p->Pawns(sd)))
            AddPawns(e, sd, Par.values[ISO_MG] + Par.values[ISO_OF] * fl_unopposed, Par.values[ISO_EG]);
        else if (!(Mask.supported[sd][sq] & p->Pawns(sd)))
            AddPawns(e, sd, Par.backward_malus_mg[File(sq)] + Par.values[BK_OPE] * fl_unopposed, Par.values[BK_END]);
    }

    AddPawns(e, sd, (mass_mg * Par.values[W_MASS]) / 100, (mass_eg * Par.values[W_MASS]) / 100);
}

void cEngine::EvaluatePassers(POS *p, eData *e, eColor sd) {

    U64 bb_pieces, bb_pawn, bb_stop;
    int sq, mg_tmp, eg_tmp, mul;
    eColor op = ~sd;
    int mg_tot = 0;
    int eg_tot = 0;

    bb_pieces = p->Pawns(sd);
    while (bb_pieces) {
        sq = BB.PopFirstBit(&bb_pieces);
        bb_pawn = SqBb(sq);
        bb_stop = BB.ShiftFwd(SqBb(sq), sd);

        // pawn can attack enemy piece

        if (!(bb_stop & p->OccBb())) {
            if (!(bb_stop & e->p_can_take[op])) {
                if (BB.GetPawnControl(bb_stop, sd) & (p->Bishops(op) | p->Knights(op)))
                    Add(e, sd, Par.values[P_THR]);
                if (bb_pawn & (RANK_2_BB | RANK_7_BB)) { // possible attack by a double pawn move
                    U64 next = BB.ShiftFwd(bb_stop, sd);
                    if (!(next & p->OccBb())) {
                        if (!(next & e->p_can_take[op])) {
                            if (BB.GetPawnControl(next, sd) & (p->Bishops(op) | p->Knights(op)))
                                Add(e, sd, Par.values[P_THR]);
                        }
                    }
                }
            }
        }

        // passed pawns

        if (!(Mask.passed[sd][sq] & p->Pawns(op))) {
            mul = 100;

            if (bb_pawn & e->p_takes[sd]) mul += Par.values[P_DEFMUL];
            if (bb_stop & e->p_takes[sd]) mul += Par.values[P_STOPMUL];

            if (bb_stop & p->OccBb()) mul -= Par.values[P_BL_MUL];   // blocked passers score less

            else if ((bb_stop & e->all_att[sd])  // our control of stop square
                 && (bb_stop & ~e->all_att[op])) mul += Par.values[P_OURSTOP_MUL];

            else if ((bb_stop & e->all_att[op])  // opp control of stop square
                 && (bb_stop & ~e->all_att[sd])) mul -= Par.values[P_OPPSTOP_MUL];

            // in the midgame, we use just a bonus from the table
            // in the endgame, passed pawn attracts both kings.

            mg_tmp = Par.passed_bonus_mg[sd][Rank(sq)];
            eg_tmp = Par.passed_bonus_eg[sd][Rank(sq)]
                     - ((Par.passed_bonus_eg[sd][Rank(sq)] * Dist.bonus[sq][p->mKingSq[op]]) / 30)
                     + ((Par.passed_bonus_eg[sd][Rank(sq)] * Dist.bonus[sq][p->mKingSq[sd]]) / 90);

            mg_tot += (mg_tmp * mul) / 100;
            eg_tot += (eg_tmp * mul) / 100;
        }
    }

    Add(e, sd, (mg_tot * Par.values[W_PASSERS]) / 100, (eg_tot * Par.values[W_PASSERS]) / 100);
}

void cEngine::EvaluateUnstoppable(eData *e, POS *p) {

    U64 bb_pieces, bb_span;
    int w_dist = 8;
    int b_dist = 8;
    int sq, king_sq, pawn_sq, tempo, prom_dist;

    // White unstoppable passers

    if (p->mCnt[BC][N] + p->mCnt[BC][B] + p->mCnt[BC][R] + p->mCnt[BC][Q] == 0) {
        king_sq = p->KingSq(BC);
        if (p->mSide == BC) tempo = 1; else tempo = 0;
        bb_pieces = p->Pawns(WC);
        while (bb_pieces) {
            sq = BB.PopFirstBit(&bb_pieces);
            if (!(Mask.passed[WC][sq] & p->Pawns(BC))) {
                bb_span = BB.GetFrontSpan(SqBb(sq), WC);
                pawn_sq = ((WC - 1) & 56) + (sq & 7);
                prom_dist = Min(5, Dist.metric[sq][pawn_sq]);

                if (prom_dist < (Dist.metric[king_sq][pawn_sq] - tempo)) {
                    if (bb_span & p->Kings(WC)) prom_dist++;
                    w_dist = Min(w_dist, prom_dist);
                }
            }
        }
    }

    // Black unstoppable passers

    if (p->mCnt[WC][N] + p->mCnt[WC][B] + p->mCnt[WC][R] + p->mCnt[WC][Q] == 0) {
        king_sq = p->KingSq(WC);
        if (p->mSide == WC) tempo = 1; else tempo = 0;
        bb_pieces = p->Pawns(BC);
        while (bb_pieces) {
            sq = BB.PopFirstBit(&bb_pieces);
            if (!(Mask.passed[BC][sq] & p->Pawns(WC))) {
                bb_span = BB.GetFrontSpan(SqBb(sq), BC);
                pawn_sq = ((BC - 1) & 56) + (sq & 7);
                prom_dist = Min(5, Dist.metric[sq][pawn_sq]);

                if (prom_dist < (Dist.metric[king_sq][pawn_sq] - tempo)) {
                    if (bb_span & p->Kings(BC)) prom_dist++;
                    b_dist = Min(b_dist, prom_dist);
                }
            }
        }
    }

    if (w_dist < b_dist - 1) Add(e, WC, 0, 500);
    if (b_dist < w_dist - 1) Add(e, BC, 0, 500);
}


void cEngine::Add(eData *e, eColor sd, int mg_val, int eg_val) {

    e->mg[sd] += mg_val;
    e->eg[sd] += eg_val;
}

void cEngine::Add(eData *e, eColor sd, int val) {

    e->mg[sd] += val;
    e->eg[sd] += val;
}

void cEngine::AddPawns(eData *e, eColor sd, int mg_val, int eg_val) {

    e->mg_pawns[sd] += mg_val;
    e->eg_pawns[sd] += eg_val;
}

int cEngine::Interpolate(POS *p, eData *e) {

    int mg_tot = e->mg[WC] - e->mg[BC];
    int eg_tot = e->eg[WC] - e->eg[BC];
    int mg_phase = Min(p->mPhase, 24);
    int eg_phase = 24 - mg_phase;

    return (mg_tot * mg_phase + eg_tot * eg_phase) / 24;
}

void cEngine::EvaluateThreats(POS *p, eData *e, eColor sd) {

    int pc, sq;
    int mg = 0;
    int eg = 0;
    eColor op = ~sd;

    U64 bb_undefended = p->mClBb[op];
    U64 bb_threatened = bb_undefended & e->p_takes[sd];
    U64 bb_defended = bb_undefended & e->all_att[op];
    U64 bb_hanging = bb_undefended & ~e->p_takes[op];

    bb_undefended &= ~e->all_att[sd];
    bb_undefended &= ~e->all_att[op];

    bb_hanging |= bb_threatened;     // piece attacked by our pawn isn't well defended
    bb_hanging &= e->all_att[sd];    // hanging piece has to be attacked

    bb_defended &= e->ev_att[sd];    // N, B, R attacks (pieces attacked by pawns are scored as hanging)
    bb_defended &= ~e->p_takes[sd];  // no defense against pawn attack

	const int att_on_hang_mg[7] = {  0, 15, 15, 17, 25,  0,   0 };
	const int att_on_hang_eg[7] = {  0, 23, 23, 25, 33,  0,   0 };
	const int att_on_def_mg[7]  = {  0,  8,  8, 10, 15,  0,   0 };
	const int att_on_def_eg[7]  = {  0, 12, 12, 14, 19,  0,   0 };
	const int unatt_undef_mg[7] = {  0,  5,  5,  5,  5,  0,   0 };
	const int unatt_undef_eg[7] = {  0,  9,  9,  9,  9,  0,   0 };

    // hanging pieces (attacked and undefended, based on DiscoCheck)

    while (bb_hanging) {
        sq = BB.PopFirstBit(&bb_hanging);
        pc = p->TpOnSq(sq);
        mg += att_on_hang_mg[pc];
        eg += att_on_hang_eg[pc];
    }

    // defended pieces under attack

    while (bb_defended) {
        sq = BB.PopFirstBit(&bb_defended);
        pc = p->TpOnSq(sq);
        mg += att_on_def_mg[pc];
        eg += att_on_def_eg[pc];
    }

    // unattacked and undefended

    while (bb_undefended) {
		sq = BB.PopFirstBit(&bb_undefended);
		pc = p->TpOnSq(sq);
		mg += unatt_undef_mg[pc];
		eg += unatt_undef_eg[pc];
    }

    Add(e, sd, (Par.values[W_THREATS] * mg) / 100, (Par.values[W_THREATS] * eg) / 100);
}

int cEngine::Evaluate(POS *p, eData *e) {

    // Try retrieving score from per-thread eval hashtable

    int addr = p->mHashKey % EVAL_HASH_SIZE;

    if (mEvalTT[addr].key == p->mHashKey) {
        int sc = mEvalTT[addr].score;
        return p->mSide == WC ? sc : -sc;
    }

    // Clear eval data

    e->mg[WC] = p->mMgSc[WC];
    e->mg[BC] = p->mMgSc[BC];
    e->eg[WC] = p->mEgSc[WC];
    e->eg[BC] = p->mEgSc[BC];
	e->att[WC] = e->att[BC] = 0;
	e->wood[WC] = e->wood[BC] = 0;

    // Init helper bitboards (pawn info)

    e->p_takes[WC] = BB.GetWPControl(p->Pawns(WC));
    e->p_takes[BC] = BB.GetBPControl(p->Pawns(BC));
    e->p_can_take[WC] = BB.FillNorth(e->p_takes[WC]);
    e->p_can_take[BC] = BB.FillSouth(e->p_takes[BC]);
    e->two_pawns_take[WC] = BB.GetDoubleWPControl(p->Pawns(WC));
    e->two_pawns_take[BC] = BB.GetDoubleBPControl(p->Pawns(BC));

    // Init or clear attack maps

    e->all_att[WC] = e->p_takes[WC] | BB.KingAttacks(p->KingSq(WC));
    e->all_att[BC] = e->p_takes[BC] | BB.KingAttacks(p->KingSq(BC));
    e->ev_att[WC] = 0ULL;
    e->ev_att[BC] = 0ULL;

    // Run all the evaluation subroutines

    EvaluateMaterial(p, e, WC);
    EvaluateMaterial(p, e, BC);
    EvaluatePieces(p, e, WC);
    EvaluatePieces(p, e, BC);
    EvaluatePawnStruct(p, e);
    EvaluatePassers(p, e, WC);
    EvaluatePassers(p, e, BC);
    EvaluateUnstoppable(e, p);
    EvaluateThreats(p, e, WC);
    EvaluateThreats(p, e, BC);
    Add(e, p->mSide, 14, 7); // tempo bonus

    // Evaluate patterns

    EvaluateKnightPatterns(p, e);
    EvaluateBishopPatterns(p, e);
    EvaluateKingPatterns(p, e);
    EvaluateCentralPatterns(p, e);

     EvaluateKingAttack(p, e, WC);
	EvaluateKingAttack(p, e, BC);

    // TAL SACRIFICE BONUS - Pure Mikhail Tal style
    // "I would gladly sacrifice a piece to get an attack!" - Mikhail Tal
    // When we sacrifice material but have a strong attack, we are HAPPY!
    {
        // Base piece values (from params)
        const int p_val = 100, n_val = 325, b_val = 340, r_val = 500, q_val = 950;

        for (eColor sd = WC; sd < 2; ++sd) {
            eColor op = ~sd;

            // Calculate material
            int our_mat = p->mCnt[sd][P] * p_val + p->mCnt[sd][N] * n_val
                       + p->mCnt[sd][B] * b_val + p->mCnt[sd][R] * r_val
                       + p->mCnt[sd][Q] * q_val;
            int opp_mat = p->mCnt[op][P] * p_val + p->mCnt[op][N] * n_val
                       + p->mCnt[op][B] * b_val + p->mCnt[op][R] * r_val
                       + p->mCnt[op][Q] * q_val;

            int mat_diff = our_mat - opp_mat; // negative = we sacrificed

            // Sacrificed material but have attack? TAL WOULD LOVE THIS!
            if (mat_diff < 0 && e->att[sd] > 30) {
                int sac_bonus_mg = (-mat_diff) * Min(e->att[sd], 150) / 50;
                int sac_bonus_eg = sac_bonus_mg / 3;
                Add(e, sd, sac_bonus_mg, sac_bonus_eg);
            }

            // TAL SPECIAL: Exchange sacrifice (Rook for N/B) when attacking
            if (p->mCnt[sd][R] < p->mCnt[op][R] && e->att[sd] > 50) {
                int exc_bonus = 200 * Min(e->att[sd], 100) / 100;
                Add(e, sd, exc_bonus, exc_bonus / 2);
            }

            // Queen-Knight coordination (Tal's favorite combo)
            if (p->mCnt[sd][Q] > 0 && p->mCnt[sd][N] > 0) {
                U64 q_sq = p->Queens(sd);
                U64 n_sq = p->Knights(sd);
                if (q_sq && n_sq) {
                    int q_pos = BB.PopFirstBit(&q_sq);
                    int n_pos = BB.PopFirstBit(&n_sq);
                    int dist = Dist.metric[q_pos][n_pos];
                    if (dist < 4) { // Close coordination
                        Add(e, sd, 100, 50);
                    }
                }
            }

            // Bishop on aggressive square near enemy king (Tal's Bxh6!)
            U64 our_b = p->Bishops(sd);
            int opp_king = p->KingSq(op);
            while (our_b) {
                int b_sq = BB.PopFirstBit(&our_b);
                int dist_to_king = Dist.metric[b_sq][opp_king];
                if (dist_to_king < 4 && (SqBb(b_sq) & Mask.away[sd])) {
                    Add(e, sd, 80, 40); // Bishop near enemy king
                }
            }

            // TAL CHAOS BONUS: Many pieces around enemy king = GOOD
            int pieces_near_king = 0;
            U64 all_our = p->mClBb[sd] & ~p->Pawns(sd);
            U64 our_att = e->all_att[sd];
            while (all_our) {
                int sq = BB.PopFirstBit(&all_our);
                if (Dist.metric[sq][opp_king] < 4) pieces_near_king++;
            }
            if (pieces_near_king >= 3 && e->att[sd] > 20) {
                Add(e, sd, pieces_near_king * 30, pieces_near_king * 15);
            }

            // TAL SPECIAL: Open file towards enemy king
            int king_file = File(opp_king);
            U64 file_bb = BB.FillNorth(SqBb(opp_king)) | BB.FillSouth(SqBb(opp_king));
            if (!(file_bb & p->Pawns(sd)) && !(file_bb & p->Pawns(op))) {
                // Open file - Tal loves this!
                if (file_bb & (p->Rooks(sd) | p->Queens(sd))) {
                    Add(e, sd, 150, 75); // Rook/Queen on open file near king
                }
            }

            // TAL: Sacrifice ANY piece for mating attack
            if (e->att[sd] > 80 && mat_diff < 200) {
                // We have a HUGE attack - material doesn't matter!
                Add(e, sd, 300, 100); // "The attack is worth more than the pieces!"
            }

            // TAL: Ignore endgame safety - always go for the king
            if (e->att[sd] > 60) {
                // Reduce penalty for our king safety
                Add(e, sd, 50, 25); // "My king can take care of himself!"
            }

            // TAL SIGNATURE: Knight sacrifice on f7/f2 (classic attacking square)
            if (p->mCnt[sd][N] > 0) {
                U64 n_sq = p->Knights(sd);
                int opp_king = p->KingSq(op);
                while (n_sq) {
                    int knight_sq = BB.PopFirstBit(&n_sq);
                    // Knight on f7/f2 square near enemy king?
                    if ((SqBb(knight_sq) & BB.KingAttacks(opp_king)) &&
                        e->att[sd] > 40) {
                        Add(e, sd, 150, 75); // Nxf7+!! - pure Tal
                    }
                }
            }

            // TAL SIGNATURE: Pawn storm against castled king
            if (p->mCnt[sd][P] > 0) {
                U64 pawns = p->Pawns(sd);
                int opp_king = p->KingSq(op);
                int king_file = File(opp_king);
                // Pawns on g-file or h-file pushing toward king
                if (king_file >= 4) { // King on kingside
                    U64 storm_pawns = pawns & (FILE_G_BB | FILE_H_BB);
                    if (storm_pawns && (SqBb(opp_king) & (RANK_7_BB | RANK_8_BB))) {
                        Add(e, sd, 100, 50); // g4/g5/h4/h5 coming!
                    }
                }
            }

            // TAL: Bishop sacrifice on h6/h3 (famous Bxh6+)
            if (p->mCnt[sd][B] > 0) {
                U64 b_sq = p->Bishops(sd);
                int opp_king = p->KingSq(op);
                while (b_sq) {
                    int bish_sq = BB.PopFirstBit(&b_sq);
                    // Bishop can sacrifice on h6/h3?
                    if (File(bish_sq) == FILE_H && Rank(bish_sq) >= RANK_5) {
                        if (Dist.metric[bish_sq][opp_king] < 3 && e->att[sd] > 30) {
                            Add(e, sd, 200, 100); // Bxh6+!! - TAL'S FAMOUS SACRIFICE
                        }
                    }
                }
            }

            // TAL: Improve piece placement - Tal loved active pieces
            U64 active_pieces = p->mClBb[sd] & Mask.away[sd];
            int active_cnt = BB.PopCnt(active_pieces);
            Add(e, sd, active_cnt * 10, active_cnt * 5); // Active pieces = good!

            // TAL: Discourage passive defense - we ATTACK!
            if (e->att[op] > e->att[sd] && e->att[sd] < 20) {
                Add(e, sd, -50, -25); // "Why am I defending? ATTACK!"
            }

            // TAL SIGNATURE: Exchange sacrifice (Rook for minor) when attacking
            if (p->mCnt[sd][R] > 0 && e->att[sd] > 40) {
                if (p->mCnt[sd][R] < p->mCnt[op][R] ||
                    p->mCnt[sd][N] + p->mCnt[sd][B] > p->mCnt[op][N] + p->mCnt[op][B]) {
                    // We sacrificed exchange but have attack - TAL LOVES THIS
                    Add(e, sd, 250, 100); // "The exchange doesn't matter!"
                }
            }

            // TAL: Knight on the rim is sometimes dim - BUT TAL used them!
            U64 knights = p->Knights(sd);
            while (knights) {
                int n_sq = BB.PopFirstBit(&knights);
                int file = File(n_sq);
                if (file == FILE_A || file == FILE_H) {
                    if (Dist.metric[n_sq][p->KingSq(op)] < 5) {
                        Add(e, sd, 60, 30); // Knight on rim near enemy king - TAL STYLE!
                    }
                }
            }

            // TAL: Bishop pair in attack - deadly combo
            if (p->mCnt[sd][B] >= 2 && e->att[sd] > 30) {
                Add(e, sd, 150, 75); // Two bishops + attack = DANGEROUS
            }

            // TAL: Queen + Bishop battery (Bc4+Qc2 or similar)
            if (p->mCnt[sd][Q] > 0 && p->mCnt[sd][B] > 0) {
                U64 q_sq = p->Queens(sd);
                U64 b_sq = p->Bishops(sd);
                if (q_sq && b_sq) {
                    int q_pos = BB.PopFirstBit(&q_sq);
                    int b_pos = BB.PopFirstBit(&b_sq);
                    // Same diagonal or coordinated?
                    if (abs(File(q_pos) - File(b_pos)) == abs(Rank(q_pos) - Rank(b_pos))) {
                        if (Dist.metric[q_pos][p->KingSq(op)] < 4) {
                            Add(e, sd, 120, 60); // Battery aimed at king!
                        }
                    }
                }
            }

            // TAL: Rook lifts (Rfe1, Rae1) - activating rooks aggressively
            U64 rooks = p->Rooks(sd);
            while (rooks) {
                int r_sq = BB.PopFirstBit(&rooks);
                int r_file = File(r_sq);
                int r_rank = Rank(r_sq);
                // Rook on central file or 7th/8th rank
                if (r_file >= FILE_D && r_file <= FILE_E && r_rank >= RANK_5) {
                    if (e->att[sd] > 25) {
                        Add(e, sd, 80, 40); // Aggressively placed rook
                    }
                }
            }

            // TAL: Multiple pieces en prise (offering sacrifices) = GOOD
            int en_prise = 0;
            for (int tp = N; tp <= Q; tp++) {
                U64 pieces = p->PcBb(sd, (ePieceType)tp);
                while (pieces) {
                    int sq = BB.PopFirstBit(&pieces);
                    if (p->Swap(sq, sq) < 0) { // We'd lose this piece in exchange
                        if (BB.KingAttacks(p->KingSq(op)) & SqBb(sq)) {
                            en_prise++; // Piece is en prise AND attacking king zone
                        }
                    }
                }
            }
            if (en_prise >= 2 && e->att[sd] > 30) {
                Add(e, sd, en_prise * 40, en_prise * 20); // "Take whichever you want!"
            }
        }
    }

    // Add pawn score (which might come from hash)

    e->mg[WC] += e->mg_pawns[WC];
    e->mg[BC] += e->mg_pawns[BC];
    e->eg[WC] += e->eg_pawns[WC];
    e->eg[BC] += e->eg_pawns[BC];

    // Add asymmetric bonus for keeping certain type of pieces

    e->mg[Par.prog_side] += Par.keep_pc[Q] * p->mCnt[Par.prog_side][Q];
    e->mg[Par.prog_side] += Par.keep_pc[R] * p->mCnt[Par.prog_side][R];
    e->mg[Par.prog_side] += Par.keep_pc[B] * p->mCnt[Par.prog_side][B];
    e->mg[Par.prog_side] += Par.keep_pc[N] * p->mCnt[Par.prog_side][N];
    e->mg[Par.prog_side] += Par.keep_pc[P] * p->mCnt[Par.prog_side][P];

    // Interpolate between midgame and endgame scores

    int score = Interpolate(p, e);

    // Material imbalance evaluation (based on Crafty)

    int minor_balance = p->mCnt[WC][N] - p->mCnt[BC][N] + p->mCnt[WC][B] - p->mCnt[BC][B];
    int major_balance = p->mCnt[WC][R] - p->mCnt[BC][R] + 2 * p->mCnt[WC][Q] - 2 * p->mCnt[BC][Q];

    int x = Max(major_balance + 4, 0);
    if (x > 8) x = 8;

    int y = Max(minor_balance + 4, 0);
    if (y > 8) y = 8;

    score += Par.imbalance[x][y];

    // Weakening: add pseudo-random value to eval score

    if (Par.eval_blur) {
        int rand_mod = (Par.eval_blur / 2) - ( (p->mHashKey ^ Glob.game_key) % Par.eval_blur);
        score += rand_mod;
    }

    // Special case code for KBN vs K checkmate

    score += CheckmateHelper(p);

    // Decrease score for drawish endgames

    int draw_factor = 64;
    if (score > 0) draw_factor = GetDrawFactor(p, WC);
    if (score < 0) draw_factor = GetDrawFactor(p, BC);
    score = (score * draw_factor) / 64;

    // Ensure that returned value doesn't exceed mate score

    score = Clip(score, MAX_EVAL);

    // Save eval score in the evaluation hash table

    mEvalTT[addr].key = p->mHashKey;
    mEvalTT[addr].score = score;

    // Return score relative to the side to move

    return p->mSide == WC ? score : -score;
}
