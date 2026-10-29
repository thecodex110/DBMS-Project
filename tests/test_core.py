# Run with:  python3 -m unittest discover tests      (uses a throw-away database file)
import os
import sqlite3
import sys
import tempfile
import unittest

os.environ['CAAMS_DB'] = os.path.join(tempfile.gettempdir(), 'caams_test_%d.db' % os.getpid())
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from caams.db import connection as db  # noqa: E402
from caams.db import init  # noqa: E402
from caams.labs.algorithms import concurrency as cc  # noqa: E402
from caams.labs.algorithms import fd  # noqa: E402
from caams.labs.algorithms.index_structures import BPlusTree, ExtendibleHash  # noqa: E402


def setUpModule():
    init.reset_database()


def tearDownModule():
    db.delete_database_files()


class DatabaseTests(unittest.TestCase):
    def test_database_builds_with_data_in_every_core_table(self):
        for t in ['department', 'faculty', 'student', 'subject', 'enrollment', 'class_session', 'attendance', 'exam_result']:
            self.assertGreater(db.get('SELECT COUNT(*) AS n FROM %s' % t)['n'], 0, t)

    def test_constraints_reject_bad_data(self):
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'CHECK'):
            db.run("INSERT INTO student (roll_no, first_name, last_name, gender, dob, year, dept_id) VALUES ('X1','a','b','Z','2005-01-01',3,'CS')")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'FOREIGN KEY'):
            db.run("INSERT INTO student (roll_no, first_name, last_name, gender, dob, year, dept_id) VALUES ('X1','a','b','M','2005-01-01',3,'NOPE')")
        with self.assertRaisesRegex(sqlite3.IntegrityError, 'FOREIGN KEY'):
            db.run("DELETE FROM department WHERE dept_id = 'CS'")

    def test_trigger_blocks_attendance_for_a_non_enrolled_student(self):
        sid = db.get("SELECT session_id FROM class_session WHERE subject_id = 'CS501' LIMIT 1")['session_id']
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'not enrolled'):
            db.run("INSERT INTO attendance (session_id, roll_no, status) VALUES (?, '23ME001', 'P')", sid)

    def test_transaction_rolls_back_atomically(self):
        before = db.get('SELECT COUNT(*) AS n FROM class_session')['n']

        def work():
            db.run("INSERT INTO class_session (subject_id, faculty_id, session_date, start_time) VALUES ('CS501','FAC101','2026-01-05','08:00')")
            raise RuntimeError('boom')
        with self.assertRaises(RuntimeError):
            db.transaction(work)
        self.assertEqual(db.get('SELECT COUNT(*) AS n FROM class_session')['n'], before)


class AlgorithmTests(unittest.TestCase):
    def test_normalization_keys_and_normal_forms(self):
        rel = fd.parse_relation('ABCDE')
        fds = fd.parse_fds('A -> BC; CD -> E; B -> D; E -> A', rel)
        a = fd.analyze(rel['attrs'], fds)
        self.assertEqual(sorted(''.join(k) for k in a['keys']), ['A', 'BC', 'CD', 'E'])
        self.assertEqual(a['nf'], '3NF')
        b = fd.bcnf_decompose(rel['attrs'], fds)
        self.assertTrue(fd.lossless_chase(rel['attrs'], b['relations'], fds)['lossless'])

    def test_concurrency_precedence_graph_and_2pl_deadlock(self):
        self.assertFalse(cc.conflict_serializable(cc.parse_schedule('R1(A) R2(A) W1(A) W2(A)'))['serializable'])
        self.assertTrue(cc.view_serializable(cc.parse_schedule('R1(A) W2(A) W1(A) W3(A)'))['serializable'])
        r = cc.simulate_2pl(cc.parse_schedule('R1(A) R2(B) W1(B) W2(A) C1 C2'))
        self.assertEqual(r['aborted'], [2])

    def test_bplus_tree_sorted_and_extendible_hash_keeps_all_keys(self):
        t = BPlusTree(4)
        keys = [7, 14, 2, 19, 11, 4, 16, 1, 9, 20, 5, 13, 18, 3, 10, 6, 15, 8, 12, 17]
        for k in keys:
            t.insert(k)
        self.assertEqual(t.range(1, 20)['keys'], sorted(keys))
        h = ExtendibleHash(2)
        for k in keys:
            h.insert(k)
        buckets = list({id(b): b for b in h.dir}.values())
        self.assertGreater(len(buckets), 1)
        self.assertEqual(sorted(k for b in buckets for k in b.keys), sorted(keys))


if __name__ == '__main__':
    unittest.main()
