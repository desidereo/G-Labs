//+------------------------------------------------------------------+
//|                                                   LondonORB.mq5  |
//|                                                          G-Labs  |
//|  London-open range breakout (research code: mt5/backtest/        |
//|  backtest_orb.py, hypothesis H3 in mt5/research/edge_research.md) |
//|                                                                   |
//|  Rule (all times LONDON wall clock, DST handled automatically):   |
//|   1. Range = high/low of 03:00-08:00 London.                      |
//|   2. From 08:00 place an OCO pair of stop orders at the range     |
//|      high (buy) and range low (sell). SL = opposite side of the   |
//|      range. No TP. Orders expire at 11:00 London if not filled.   |
//|   3. Any open position is closed at 17:00 London (time exit).     |
//|   4. One trade per day, risk-percent sizing on the range size.    |
//|                                                                   |
//|  IMPORTANT - validation verdict (Aug 2026, 2022-2025 Dukascopy    |
//|  M1, 4 symbols, IC-Raw costs): NET expectancy out-of-sample is    |
//|  ~ZERO (pooled +0.0003 R, t=0.01). This EA is a faithful          |
//|  implementation of the researched rule, NOT a validated edge.     |
//|  See mt5/research/validation_report.md before trading it.         |
//+------------------------------------------------------------------+
#property copyright "G-Labs"
#property version   "1.00"
#property strict
#property description "London-open range breakout with OCO stop orders and time exit."

#include <Trade/Trade.mqh>

//====================================================================
//  INPUTS
//====================================================================
enum ENUM_BROKER_SCHEME
  {
   SCHEME_ICM_AUTO23 = 0, // Auto GMT+2/+3 by US DST (IC Markets & NY-close brokers)
   SCHEME_FIXED      = 1  // Use the fixed manual offset below
  };

input group "=== Broker time zone ==="
input ENUM_BROKER_SCHEME InpBrokerScheme   = SCHEME_ICM_AUTO23; // How to determine broker GMT offset
input int                InpBrokerGMTFixed = 3;                 // Fixed broker GMT offset (if scheme=FIXED)

input group "=== Session (LONDON wall-clock time, 24h) ==="
input int    InpRangeStartHour = 3;    // Range window start hour
input int    InpRangeEndHour   = 8;    // Range window end hour (= breakout window start)
input int    InpHuntEndHour    = 11;   // Breakout window end (pending orders removed)
input int    InpExitHour       = 17;   // Time exit: close any open position

input group "=== Risk management ==="
input bool   InpUseRiskPercent = true;   // Size by % risk (else fixed lot)
input double InpRiskPercent    = 0.5;    // Risk per trade (% of balance)
input double InpFixedLot       = 0.10;   // Fixed lot (if % risk is off)
input int    InpMaxSpreadPts   = 30;     // Skip placement if spread > this (points, 0=off)
input int    InpMinRangePts    = 0;      // Skip day if range smaller than this (points, 0=off)

input group "=== Trade management ==="
input long   InpMagic       = 990022;    // Magic number
input int    InpSlippagePts = 30;        // Max deviation (points)
input string InpComment     = "LondonORB";

input group "=== Display ==="
input bool   InpDrawObjects = true;      // Draw the range on the chart
input bool   InpShowPanel   = true;      // Show info panel (Comment)

//====================================================================
//  GLOBALS
//====================================================================
CTrade   trade;

datetime g_curLonDay   = 0;     // London date (00:00) currently being managed
bool     g_placed      = false; // OCO stops placed for this day
bool     g_traded      = false; // a position existed today (one trade/day)
double   g_rangeHigh   = 0.0;
double   g_rangeLow    = 0.0;

//====================================================================
//  TIME ZONE HELPERS
//====================================================================
// nth Sunday of a month, 00:00 (n=1 -> first)
datetime NthSunday(const int year, const int month, const int n)
  {
   MqlDateTime s; ZeroMemory(s);
   s.year = year; s.mon = month; s.day = 1;
   datetime d1 = StructToTime(s);
   MqlDateTime t; TimeToStruct(d1, t);
   int firstSun = 1 + ((7 - t.day_of_week) % 7);
   s.day = firstSun + (n - 1) * 7;
   return StructToTime(s);
  }

// last Sunday of a month, 00:00
datetime LastSunday(const int year, const int month)
  {
   static const int mdays[13] = {0,31,28,31,30,31,30,31,31,30,31,30,31};
   int dmax = mdays[month];
   if(month == 2 && (year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)))
      dmax = 29;
   MqlDateTime s; ZeroMemory(s);
   s.year = year; s.mon = month; s.day = dmax;
   datetime dl = StructToTime(s);
   MqlDateTime t; TimeToStruct(dl, t);
   return dl - t.day_of_week * 86400;
  }

// US DST: 2nd Sunday March 02:00 -> 1st Sunday November 02:00 (local clock)
bool IsUSDst(const datetime t)
  {
   MqlDateTime s; TimeToStruct(t, s);
   datetime beg = NthSunday(s.year, 3, 2)  + 2 * 3600;
   datetime end = NthSunday(s.year, 11, 1) + 2 * 3600;
   return (t >= beg && t < end);
  }

// UK DST: last Sunday March 01:00 UTC -> last Sunday October 01:00 UTC
bool IsUKDst(const datetime utc)
  {
   MqlDateTime s; TimeToStruct(utc, s);
   datetime beg = LastSunday(s.year, 3)  + 1 * 3600;
   datetime end = LastSunday(s.year, 10) + 1 * 3600;
   return (utc >= beg && utc < end);
  }

// broker GMT offset in hours for a given SERVER time
int BrokerOffset(const datetime serverTime)
  {
   if(InpBrokerScheme == SCHEME_FIXED)
      return InpBrokerGMTFixed;
   return IsUSDst(serverTime) ? 3 : 2;   // IC Markets convention
  }

datetime ServerToUTC(const datetime srv)   { return srv - BrokerOffset(srv) * 3600; }
datetime UTCToLondon(const datetime utc)   { return utc + (IsUKDst(utc) ? 1 : 0) * 3600; }
datetime ServerToLondon(const datetime srv){ return UTCToLondon(ServerToUTC(srv)); }

// convert a London wall-clock time to UTC (fixed-point refinement for DST edges)
datetime LondonToUTC(const datetime lonWall)
  {
   datetime utc = lonWall - (IsUKDst(lonWall) ? 1 : 0) * 3600;
   utc = lonWall - (IsUKDst(utc) ? 1 : 0) * 3600;     // refine once
   return utc;
  }

datetime UTCToServer(const datetime utc)
  {
   datetime srv = utc + BrokerOffset(utc) * 3600;
   srv = utc + BrokerOffset(srv) * 3600;              // refine once
   return srv;
  }

// server time of hour:00 London on the given London day (00:00 London)
datetime LondonHourToServer(const datetime lonDay, const int hour)
  {
   return UTCToServer(LondonToUTC(lonDay + hour * 3600));
  }

//====================================================================
//  POSITION / ORDER BOOKKEEPING
//====================================================================
bool HasPosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagic &&
         PositionGetString(POSITION_SYMBOL) == _Symbol)
         return true;
     }
   return false;
  }

int PendingCount()
  {
   int n = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == InpMagic &&
         OrderGetString(ORDER_SYMBOL) == _Symbol)
         n++;
     }
   return n;
  }

void DeletePendings()
  {
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      if(OrderGetInteger(ORDER_MAGIC) == InpMagic &&
         OrderGetString(ORDER_SYMBOL) == _Symbol)
         trade.OrderDelete(ticket);
     }
  }

void ClosePosition()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagic &&
         PositionGetString(POSITION_SYMBOL) == _Symbol)
         trade.PositionClose(ticket);
     }
  }

//====================================================================
//  SIZING
//====================================================================
double LotsForRisk(const double slDistance)
  {
   if(!InpUseRiskPercent)
      return InpFixedLot;
   double tickSize  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(tickSize <= 0.0 || tickValue <= 0.0 || slDistance <= 0.0)
      return InpFixedLot;
   double riskMoney  = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPercent / 100.0;
   double lossPerLot = slDistance / tickSize * tickValue;
   double lots       = riskMoney / lossPerLot;

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double step   = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step > 0.0)
      lots = MathFloor(lots / step) * step;
   return MathMin(MathMax(lots, minLot), maxLot);
  }

//====================================================================
//  RANGE COMPUTATION
//====================================================================
bool ComputeRange(const datetime srvStart, const datetime srvEnd,
                  double &rHigh, double &rLow)
  {
   // bars are indexed by OPEN time; range covers [srvStart, srvEnd)
   int iStart = iBarShift(_Symbol, PERIOD_M1, srvStart, false);
   int iEnd   = iBarShift(_Symbol, PERIOD_M1, srvEnd - 60, false);
   if(iStart < 0 || iEnd < 0 || iEnd > iStart)
      return false;
   int count = iStart - iEnd + 1;
   // require at least 2/3 of the window to have bars (mirrors the backtest)
   int expected = (int)((srvEnd - srvStart) / 60);
   if(count < expected * 2 / 3)
      return false;
   int hIdx = iHighest(_Symbol, PERIOD_M1, MODE_HIGH, count, iEnd);
   int lIdx = iLowest(_Symbol, PERIOD_M1, MODE_LOW,  count, iEnd);
   if(hIdx < 0 || lIdx < 0)
      return false;
   rHigh = iHigh(_Symbol, PERIOD_M1, hIdx);
   rLow  = iLow(_Symbol, PERIOD_M1, lIdx);
   return (rHigh > rLow);
  }

//====================================================================
//  ORDER PLACEMENT
//====================================================================
void PlaceOCO(const datetime srvExpiry)
  {
   double range = g_rangeHigh - g_rangeLow;
   if(InpMinRangePts > 0 && range < InpMinRangePts * _Point)
     {
      Print("Range too small (", DoubleToString(range / _Point, 1), " pts) - skipping day");
      g_traded = true;            // treat as done for the day
      return;
     }
   if(InpMaxSpreadPts > 0)
     {
      long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
      if(spread > InpMaxSpreadPts)
        {
         Print("Spread ", spread, " pts > limit - waiting");
         return;                  // retry on a later tick within the window
        }
     }

   int    digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double buyPx  = NormalizeDouble(g_rangeHigh, digits);
   double sellPx = NormalizeDouble(g_rangeLow,  digits);
   double lots   = LotsForRisk(range);

   long stopLvl = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   bool buyOk = true, sellOk = true;
   if(buyPx - ask < stopLvl * _Point)  buyOk  = false;  // already beyond level
   if(bid - sellPx < stopLvl * _Point) sellOk = false;

   // if price already broke a side before placement, enter at market instead
   if(!buyOk && ask > buyPx)
     {
      if(trade.Buy(lots, _Symbol, 0.0, NormalizeDouble(g_rangeLow, digits), 0.0, InpComment))
         g_placed = true;
      return;
     }
   if(!sellOk && bid < sellPx)
     {
      if(trade.Sell(lots, _Symbol, 0.0, NormalizeDouble(g_rangeHigh, digits), 0.0, InpComment))
         g_placed = true;
      return;
     }

   bool ok = true;
   if(buyOk)
      ok &= trade.BuyStop(lots, buyPx, _Symbol, sellPx, 0.0,
                          ORDER_TIME_SPECIFIED, srvExpiry, InpComment);
   if(sellOk)
      ok &= trade.SellStop(lots, sellPx, _Symbol, buyPx, 0.0,
                           ORDER_TIME_SPECIFIED, srvExpiry, InpComment);
   if(ok)
      g_placed = true;
   else
      Print("Order placement failed: ", trade.ResultRetcodeDescription());
  }

//====================================================================
//  CHART OBJECTS / PANEL
//====================================================================
void DrawRange(const datetime srvStart, const datetime srvEnd)
  {
   if(!InpDrawObjects) return;
   string name = "ORB_range_" + TimeToString(srvStart, TIME_DATE);
   if(ObjectFind(0, name) >= 0) return;
   ObjectCreate(0, name, OBJ_RECTANGLE, 0, srvStart, g_rangeLow, srvEnd, g_rangeHigh);
   ObjectSetInteger(0, name, OBJPROP_COLOR, clrSteelBlue);
   ObjectSetInteger(0, name, OBJPROP_STYLE, STYLE_DOT);
   ObjectSetInteger(0, name, OBJPROP_FILL, false);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
  }

void ShowPanel(const datetime lonNow)
  {
   if(!InpShowPanel) return;
   string s = "LondonORB  |  London time: " + TimeToString(lonNow, TIME_DATE | TIME_MINUTES) + "\n";
   s += "Range " + IntegerToString(InpRangeStartHour) + ":00-" +
        IntegerToString(InpRangeEndHour) + ":00 London  ->  ";
   if(g_rangeHigh > 0.0)
      s += DoubleToString(g_rangeLow, _Digits) + " / " + DoubleToString(g_rangeHigh, _Digits);
   else
      s += "(pending)";
   s += "\nState: " + (g_traded ? "done for today" :
                       (HasPosition() ? "IN POSITION (exit " + IntegerToString(InpExitHour) + ":00 London)" :
                        (g_placed ? "OCO stops working" : "waiting for breakout window")));
   Comment(s);
  }

//====================================================================
//  MQL5 EVENTS
//====================================================================
int OnInit()
  {
   if(InpRangeStartHour >= InpRangeEndHour || InpRangeEndHour > InpHuntEndHour ||
      InpHuntEndHour > InpExitHour || InpExitHour > 23)
     {
      Print("Invalid session hours: need range start < range end <= hunt end <= exit <= 23");
      return INIT_PARAMETERS_INCORRECT;
     }
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippagePts);
   trade.SetTypeFillingBySymbol(_Symbol);
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   Comment("");
  }

void OnTick()
  {
   datetime srvNow = TimeTradeServer();
   datetime lonNow = ServerToLondon(srvNow);
   datetime lonDay = lonNow - (lonNow % 86400);
   MqlDateTime lt; TimeToStruct(lonNow, lt);

   // ---- new London day: reset state
   if(lonDay != g_curLonDay)
     {
      g_curLonDay = lonDay;
      g_placed    = false;
      g_traded    = false;
      g_rangeHigh = 0.0;
      g_rangeLow  = 0.0;
     }

   // ---- weekend guard (Saturday/Sunday London)
   if(lt.day_of_week == 0 || lt.day_of_week == 6)
     {
      ShowPanel(lonNow);
      return;
     }

   bool inPos = HasPosition();
   if(inPos)
      g_traded = true;

   // ---- OCO: a fill happened -> remove the sibling stop
   if(inPos && PendingCount() > 0)
      DeletePendings();

   // ---- time exit
   if(lt.hour >= InpExitHour)
     {
      if(inPos)
         ClosePosition();
      if(PendingCount() > 0)
         DeletePendings();
      ShowPanel(lonNow);
      return;
     }

   // ---- breakout window over: remove unfilled stops (backup to expiry)
   if(lt.hour >= InpHuntEndHour && !inPos && PendingCount() > 0)
      DeletePendings();

   // ---- place the OCO pair inside the breakout window
   if(!g_placed && !g_traded && lt.hour >= InpRangeEndHour && lt.hour < InpHuntEndHour)
     {
      datetime srvStart = LondonHourToServer(g_curLonDay, InpRangeStartHour);
      datetime srvEnd   = LondonHourToServer(g_curLonDay, InpRangeEndHour);
      if(ComputeRange(srvStart, srvEnd, g_rangeHigh, g_rangeLow))
        {
         DrawRange(srvStart, srvEnd);
         PlaceOCO(LondonHourToServer(g_curLonDay, InpHuntEndHour));
        }
     }

   ShowPanel(lonNow);
  }
//+------------------------------------------------------------------+
