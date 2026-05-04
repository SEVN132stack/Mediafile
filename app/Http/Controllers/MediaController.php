<?php

namespace App\Http\Controllers;

use App\Models\MediaRequest;
use App\Services\TmdbService;
use Illuminate\Http\Request;

class MediaController extends Controller
{
    public function __construct(private TmdbService $tmdb) {}

    public function search(Request $request)
    {
        $request->validate(['query' => 'required|string']);
        $data = $this->tmdb->search($request->query, $request->integer('page', 1));
        $data['results'] = collect($data['results'])->filter(fn($r) =>
            in_array($r['media_type'], ['movie', 'tv', 'person'])
        )->values()->toArray();
        return response()->json($data);
    }

    public function trending(string $type, Request $request)
    {
        $type = $type === 'tv' ? 'tv' : 'movie';
        return response()->json($this->tmdb->trending($type, $request->integer('page', 1)));
    }

    public function genres(string $type)
    {
        return response()->json($this->tmdb->genres($type === 'tv' ? 'tv' : 'movie'));
    }

    public function discover(string $type, Request $request)
    {
        $params = ['page' => $request->integer('page', 1), 'sort_by' => $request->get('sort', 'popularity.desc')];
        if ($request->has('genre')) $params['with_genres'] = $request->genre;
        return response()->json($this->tmdb->discover($type === 'tv' ? 'tv' : 'movie', $params));
    }

    public function collection(string $type, string $collection, Request $request)
    {
        $type = $type === 'tv' ? 'tv' : 'movie';
        $map = [
            'popular'      => "/{$type}/popular",
            'top_rated'    => "/{$type}/top_rated",
            'upcoming'     => '/movie/upcoming',
            'now_playing'  => '/movie/now_playing',
            'airing_today' => '/tv/airing_today',
            'on_the_air'   => '/tv/on_the_air',
        ];
        if (!isset($map[$collection])) abort(400, 'Ongeldige collectie');
        return response()->json($this->tmdb->collection($map[$collection], $request->integer('page', 1)));
    }

    public function details(string $type, int $id)
    {
        $data = $this->tmdb->details($type, $id);
        $data['_request'] = MediaRequest::where('tmdb_id', $id)->where('media_type', $type)->first();
        return response()->json($data);
    }

    public function upcoming(Request $request)
    {
        return response()->json($this->tmdb->upcoming($request->integer('page', 1)));
    }

    public function person(int $id)
    {
        return response()->json($this->tmdb->person($id));
    }

    public function tmdbCollection(int $id)
    {
        return response()->json($this->tmdb->tmdbCollection($id));
    }

    public function statusMap()
    {
        $rows = MediaRequest::all(['tmdb_id', 'media_type', 'status']);
        $map = [];
        foreach ($rows as $r) $map["{$r->media_type}-{$r->tmdb_id}"] = $r->status;
        return response()->json($map);
    }

    public function recommendations(Request $request)
    {
        $user = $request->user();
        $userRequests = MediaRequest::where('requested_by', $user->username)->get();

        if ($userRequests->isEmpty()) return response()->json(['results' => []]);

        $genreCounts = [];
        $requestedIds = [];
        foreach ($userRequests as $r) {
            $requestedIds[] = $r->tmdb_id;
            foreach (explode(',', $r->genre_ids) as $gid) {
                if ($gid) $genreCounts[$gid] = ($genreCounts[$gid] ?? 0) + 1;
            }
        }

        arsort($genreCounts);
        $topGenres = array_slice(array_keys($genreCounts), 0, 3);
        if (empty($topGenres)) return response()->json(['results' => []]);

        $allResults = [];
        $recent = MediaRequest::where('requested_by', $user->username)->latest()->take(3)->get();
        foreach ($recent as $rr) {
            try {
                $recs = $this->tmdb->get("/{$rr->media_type}/{$rr->tmdb_id}/recommendations");
                foreach ($recs['results'] ?? [] as $r) {
                    $allResults[] = [...$r, 'media_type' => $rr->media_type];
                }
            } catch (\Exception) {}
        }

        try {
            $movies = $this->tmdb->discover('movie', ['with_genres' => implode(',', $topGenres), 'sort_by' => 'vote_average.desc', 'vote_count.gte' => 100]);
            foreach ($movies['results'] ?? [] as $r) $allResults[] = [...$r, 'media_type' => 'movie'];
        } catch (\Exception) {}

        $seen = [];
        $filtered = [];
        foreach ($allResults as $r) {
            $key = "{$r['media_type']}-{$r['id']}";
            if (!isset($seen[$key]) && !in_array($r['id'], $requestedIds)) {
                $seen[$key] = true;
                $filtered[] = $r;
            }
        }

        shuffle($filtered);
        return response()->json(['results' => array_slice($filtered, 0, 20)]);
    }
}
